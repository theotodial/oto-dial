import mongoose from "mongoose";
import SMS from "../models/SMS.js";
import User from "../models/User.js";
import SmsReservation from "../models/SmsReservation.js";
import Subscription from "../models/Subscription.js";
import { calculateSmsParts } from "./smsBillingService.js";
import { getCanonicalUsage } from "./usage/getCanonicalUsage.js";
import { isUnlimitedSubscription } from "./unlimitedUsageService.js";
import { getCachedUserSubscription } from "./subscriptionService.js";

export { calculateSmsParts };

const reservationQueues = new Map();

function normalizeUserId(userId) {
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  if (typeof userId === "string" && mongoose.Types.ObjectId.isValid(userId)) {
    return new mongoose.Types.ObjectId(userId);
  }
  return userId;
}

function runReservationSerialized(userId, fn) {
  const key = String(userId);
  const prev = reservationQueues.get(key) || Promise.resolve();
  const next = prev.then(() => fn()).catch((err) => {
    throw err;
  });
  reservationQueues.set(
    key,
    next.finally(() => {
      if (reservationQueues.get(key) === next) reservationQueues.delete(key);
    })
  );
  return next;
}

export class SmsGuardError extends Error {
  /**
   * @param {"INSUFFICIENT_SMS_CREDITS"|"RATE_LIMIT_EXCEEDED"} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "SmsGuardError";
    this.code = code;
  }
}

/**
 * Remaining SMS credits from plan + usage (same rules as dashboard).
 * @returns {Promise<number>} Infinity when unlimited
 */
export async function getUserRemainingSms(userId) {
  const uid = normalizeUserId(userId);
  const subscription = await Subscription.findOne({ userId: uid }).sort({ createdAt: -1 }).lean();
  if (!subscription) return 0;

  if (
    Boolean(subscription.displayUnlimited) ||
    isUnlimitedSubscription(subscription) ||
    /unlimited/i.test(String(subscription.planName || ""))
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const canonical = await getCanonicalUsage(uid, subscription);
  return Math.max(0, Number(canonical?.smsRemaining ?? 0));
}

async function sumReservedPartsForUser(userId) {
  const uid = normalizeUserId(userId);
  const [row] = await SmsReservation.aggregate([
    { $match: { userId: uid, status: "reserved" } },
    { $group: { _id: null, total: { $sum: "$reservedParts" } } },
  ]).exec();
  return Math.max(0, Number(row?.total ?? 0));
}

/**
 * Reserve credits before send (serialized per user). Idempotent on same idempotencyKey.
 *
 * @returns {Promise<{ reservation: object, reused?: boolean, alreadyFinalized?: boolean }>}
 */
export async function reserveSmsCredits(userId, smsParts, idempotencyKey) {
  const uid = normalizeUserId(userId);
  const key = String(idempotencyKey || "").trim().slice(0, 128);
  if (!key) {
    throw new SmsGuardError("INSUFFICIENT_SMS_CREDITS", "Missing idempotency key for reservation");
  }

  const parts = Math.max(1, Math.floor(Number(smsParts) || 1));

  return runReservationSerialized(uid, async () => {
    const existing = await SmsReservation.findOne({
      userId: uid,
      idempotencyKey: key,
    }).lean();

    if (existing?.status === "finalized") {
      return { reservation: existing, alreadyFinalized: true };
    }

    const subscription = await Subscription.findOne({ userId: uid }).sort({ createdAt: -1 }).lean();
    const unlimited =
      subscription &&
      (Boolean(subscription.displayUnlimited) ||
        isUnlimitedSubscription(subscription) ||
        /unlimited/i.test(String(subscription.planName || "")));

    if (!unlimited) {
      const canonical = await getCanonicalUsage(uid, subscription);
      const smsRemaining = Math.max(0, Number(canonical?.smsRemaining ?? 0));
      const totalHeld = await sumReservedPartsForUser(uid);
      const currentRowParts =
        existing?.status === "reserved" ? Math.max(0, Number(existing.reservedParts) || 0) : 0;
      const available = smsRemaining - totalHeld + currentRowParts;

      if (parts > available) {
        console.warn("[smsGuard] blocked attempt (insufficient credits)", {
          userId: String(uid),
          idempotencyKey: key,
          requestedParts: parts,
          available,
          smsRemaining,
          totalHeld,
          currentRowParts,
        });
        throw new SmsGuardError(
          "INSUFFICIENT_SMS_CREDITS",
          "Not enough SMS credits for this message (segment count exceeds remaining balance)."
        );
      }
    }

    if (existing?.status === "reserved") {
      if (existing.reservedParts !== parts) {
        await SmsReservation.updateOne(
          { _id: existing._id },
          { $set: { reservedParts: parts } }
        );
      }
      const reservation = await SmsReservation.findById(existing._id).lean();
      return { reservation, reused: true };
    }

    if (existing?.status === "released") {
      await SmsReservation.deleteOne({ _id: existing._id });
    }

    const reservation = await SmsReservation.create({
      userId: uid,
      idempotencyKey: key,
      reservedParts: parts,
      status: "reserved",
    });

    return { reservation: reservation.toObject ? reservation.toObject() : reservation };
  });
}

/**
 * Mark reservation finalized after successful billing.
 */
export async function finalizeSmsReservation(userId, idempotencyKey) {
  const uid = normalizeUserId(userId);
  const key = String(idempotencyKey || "").trim().slice(0, 128);
  if (!key) return;

  await SmsReservation.updateOne(
    { userId: uid, idempotencyKey: key, status: "reserved" },
    { $set: { status: "finalized" } }
  );
}

/**
 * Release reservation on send failure (Telnyx error, etc.).
 */
export async function releaseSmsReservation(userId, idempotencyKey) {
  const uid = normalizeUserId(userId);
  const key = String(idempotencyKey || "").trim().slice(0, 128);
  if (!key) return;

  const updated = await SmsReservation.findOneAndUpdate(
    { userId: uid, idempotencyKey: key, status: "reserved" },
    { $set: { status: "released" } },
    { new: true }
  ).lean();

  if (updated) {
    console.warn("[smsGuard] reservation released", { userId: String(uid), idempotencyKey: key });
  }
}

/**
 * Per-minute velocity using sent outbound SMS rows.
 */
export async function checkUserVelocity(userId) {
  const uid = normalizeUserId(userId);
  const since = new Date(Date.now() - 60_000);

  const [user, subscription] = await Promise.all([
    User.findById(uid).select("isEmailVerified").lean(),
    getCachedUserSubscription(uid),
  ]);

  const campaign = Boolean(subscription?.smsCampaignPlan);
  const verified = user?.isEmailVerified === true;

  let maxPerMinute = 10;
  if (campaign) maxPerMinute = 120;
  else if (verified) maxPerMinute = 60;

  const count = await SMS.countDocuments({
    user: uid,
    direction: "outbound",
    status: "sent",
    createdAt: { $gte: since },
  });

  if (count >= maxPerMinute) {
    console.warn("[smsGuard] blocked attempt (velocity)", {
      userId: String(uid),
      count,
      maxPerMinute,
      campaign,
      verified,
    });
    throw new SmsGuardError(
      "RATE_LIMIT_EXCEEDED",
      "SMS rate limit exceeded. Please wait before sending more messages."
    );
  }
}
