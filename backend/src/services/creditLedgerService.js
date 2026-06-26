/**
 * Low-level reservation / settlement helpers backed by applyBillingEvent().
 * Call-scoped outbound economics (reserve, release, per-call interval settle) are serialized
 * through economicSerializationService — prefer callCreditBillingService for call paths.
 */
import mongoose from "mongoose";
import Subscription from "../models/Subscription.js";
import { applyBillingEvent } from "./billingEnforcementGateway.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

export async function getUserCreditSnapshot(userId) {
  const uid = toObjectId(userId);
  if (!uid) return null;
  const subscription = await Subscription.findOne({ userId: uid })
    .sort({ createdAt: -1 })
    .select("remainingCredits totalCreditsUsed reservedCredits lifetimeCreditsPurchased")
    .lean();
  if (!subscription) return null;
  const source = subscription;
  return {
    remainingCredits: Number(source.remainingCredits || 0),
    totalCreditsUsed: Number(source.totalCreditsUsed || 0),
    reservedCredits: Number(source.reservedCredits || 0),
    lifetimeCreditsPurchased: Number(source.lifetimeCreditsPurchased || 0),
  };
}

export async function getLatestSubscriptionCreditSnapshot(userId) {
  const uid = toObjectId(userId);
  if (!uid) return null;
  const subscription = await Subscription.findOne({ userId: uid })
    .sort({ createdAt: -1 })
    .select("_id remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased telecomCredits")
    .lean();
  if (!subscription?._id) return null;
  return {
    subscriptionId: String(subscription._id),
    remainingCredits: Number(subscription.remainingCredits || 0),
    reservedCredits: Number(subscription.reservedCredits || 0),
    totalCreditsUsed: Number(subscription.totalCreditsUsed || 0),
    lifetimeCreditsPurchased: Number(subscription.lifetimeCreditsPurchased || 0),
    telecomCredits: Number(subscription.telecomCredits || 0),
  };
}

export async function reserveUserCredits({
  userId,
  amount,
  reservationKey,
  callId = null,
  reason = "reservation_hold",
  session = null,
}) {
  if (!reservationKey) throw new Error("reservation_key_required");
  const hold = Math.max(0, Number(amount || 0));
  if (hold <= 0) return { ok: true, skipped: true };
  const idempotencyKey = `reserve:${reservationKey}`;
  const uid = toObjectId(userId);
  const sub = await Subscription.findOne({ userId: uid }, null, {
    sort: { createdAt: -1 },
    ...(session ? { session } : {}),
  }).lean();
  if (!sub) return { ok: false, code: "SUBSCRIPTION_CREDIT_WALLET_MISSING" };
  const remaining = Number(sub.remainingCredits || 0);
  const reserved = Number(sub.reservedCredits || 0);
  const available = remaining - reserved;
  if (available < hold) {
    return {
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      balanceBefore: remaining,
      reservedBefore: reserved,
      required: hold,
    };
  }
  return applyBillingEvent({
    userId,
    amount: 0,
    type: "reservation_hold",
    reason,
    callId,
    metadata: { reservationKey, hold, availableBefore: available },
    idempotencyKey,
    allowNegative: true,
    session,
    sourceService: "creditLedgerService.reserveUserCredits",
    reservedCreditsInc: hold,
  });
}

export async function releaseReservedCredits({
  userId,
  amount,
  reservationKey,
  callId = null,
  reason = "failed_reservation_release",
  session = null,
}) {
  if (!reservationKey) throw new Error("reservation_key_required");
  const release = Math.max(0, Number(amount || 0));
  if (release <= 0) return { ok: true, skipped: true };
  const idempotencyKey = `release:${reservationKey}`;
  const uid = toObjectId(userId);
  const sub = await Subscription.findOne({ userId: uid }, null, {
    sort: { createdAt: -1 },
    ...(session ? { session } : {}),
  }).lean();
  if (!sub) return { ok: false, code: "SUBSCRIPTION_CREDIT_WALLET_MISSING" };
  const safeRelease = Math.min(release, Math.max(0, Number(sub?.reservedCredits || 0)));
  if (safeRelease <= 0) {
    return applyBillingEvent({
      userId,
      amount: 0,
      type: "failed_reservation_release",
      reason,
      callId,
      metadata: { reservationKey, release, safeRelease: 0 },
      idempotencyKey,
      allowNegative: true,
      session,
      sourceService: "creditLedgerService.releaseReservedCredits",
      reservedCreditsInc: 0,
    });
  }
  return applyBillingEvent({
    userId,
    amount: 0,
    type: "failed_reservation_release",
    reason,
    callId,
    metadata: { reservationKey, release, safeRelease },
    idempotencyKey,
    allowNegative: true,
    session,
    sourceService: "creditLedgerService.releaseReservedCredits",
    reservedCreditsInc: -safeRelease,
  });
}

export async function settleReservedCredits({
  userId,
  amount,
  reservationKey,
  callId = null,
  smsId = null,
  reason = "reservation_settled",
  session = null,
}) {
  if (!reservationKey) throw new Error("reservation_key_required");
  const settle = Math.max(0, Number(amount || 0));
  if (settle <= 0) return { ok: true, skipped: true };
  const idempotencyKey = `settle:${reservationKey}`;
  const uid = toObjectId(userId);
  const sub = await Subscription.findOne({ userId: uid }, null, {
    sort: { createdAt: -1 },
    ...(session ? { session } : {}),
  }).lean();
  if (!sub) return { ok: false, code: "SUBSCRIPTION_CREDIT_WALLET_MISSING" };
  const safeSettle = Math.min(settle, Math.max(0, Number(sub?.reservedCredits || 0)));
  if (safeSettle <= 0) {
    return applyBillingEvent({
      userId,
      amount: 0,
      type: "failed_reservation_release",
      reason,
      callId,
      smsId,
      metadata: { reservationKey, settle, safeSettle: 0 },
      idempotencyKey,
      allowNegative: true,
      session,
      sourceService: "creditLedgerService.settleReservedCredits",
      reservedCreditsInc: 0,
    });
  }
  return applyBillingEvent({
    userId,
    amount: 0,
    type: "failed_reservation_release",
    reason,
    callId,
    smsId,
    metadata: { reservationKey, settle, safeSettle },
    idempotencyKey,
    allowNegative: true,
    session,
    sourceService: "creditLedgerService.settleReservedCredits",
    reservedCreditsInc: -safeSettle,
  });
}
