/**
 * Read-only comparison of reservation signals (User vs timelines vs recent ledger holds).
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import CreditLedger from "../models/CreditLedger.js";
import Call from "../models/Call.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 */
export async function reconcileUserReservations(userId) {
  const uid = toObjectId(userId);
  if (!uid) {
    return {
      userReservedCredits: null,
      timelineReservedCredits: null,
      ledgerReservedCredits: null,
      drift: null,
      healthy: false,
      error: "invalid_user_id",
    };
  }

  const user = await User.findById(uid).select("reservedCredits").lean();
  if (!user) {
    return {
      userReservedCredits: null,
      timelineReservedCredits: null,
      ledgerReservedCredits: null,
      drift: null,
      healthy: false,
      error: "user_not_found",
    };
  }

  const userReservedCredits = num(user.reservedCredits);

  const openCalls = await Call.find({
    user: uid,
    direction: "outbound",
    status: { $in: ["answered", "in-progress", "ringing", "queued"] },
  })
    .select("_id")
    .lean();
  const openCallIds = openCalls.map((c) => c._id);

  const timelines = await EconomicTimeline.find({
    user: uid,
    finalizedAt: null,
  })
    .select("callId reservedCredits finalizedAt")
    .lean();

  let timelineReservedCredits = 0;
  for (const t of timelines) {
    timelineReservedCredits += num(t.reservedCredits);
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const holdRows = await CreditLedger.find({
    user: uid,
    type: "reservation_hold",
    createdAt: { $gte: since },
  })
    .select("callId metadata amount")
    .limit(500)
    .lean();

  let ledgerReservedCredits = 0;
  for (const row of holdRows) {
    const cid = row.callId ? String(row.callId) : "";
    if (cid && openCallIds.some((id) => String(id) === cid)) {
      ledgerReservedCredits += num(row.metadata?.hold);
    }
  }

  const drift = userReservedCredits - timelineReservedCredits;
  const healthy = Math.abs(drift) <= 5;

  return {
    userReservedCredits,
    timelineReservedCredits,
    ledgerReservedCredits,
    drift,
    healthy,
    openCallCount: openCallIds.length,
    timelineCount: timelines.length,
  };
}

/**
 * Align Subscription.reservedCredits (and User cache) to open EconomicTimeline totals.
 * Read-only source of truth: sum of timeline.reservedCredits for non-finalized timelines.
 */
export async function syncSubscriptionReservedFromTimelines(userId) {
  const uid = toObjectId(userId);
  if (!uid) return { ok: false, error: "invalid_user_id" };

  const timelines = await EconomicTimeline.find({
    user: uid,
    finalizedAt: null,
  })
    .select("reservedCredits")
    .lean();

  let timelineReserved = 0;
  for (const t of timelines) {
    timelineReserved += num(t.reservedCredits);
  }

  const sub = await Subscription.findOne({ userId: uid }).sort({ createdAt: -1 });
  if (!sub) return { ok: false, error: "subscription_not_found" };

  const before = num(sub.reservedCredits);
  if (Math.abs(before - timelineReserved) <= 5) {
    return { ok: true, changed: false, before, after: before, timelineReserved };
  }

  sub.reservedCredits = timelineReserved;
  await sub.save();

  const { syncUserCacheFromSubscription } = await import("./billingEnforcementGateway.js");
  await syncUserCacheFromSubscription(uid).catch(() => {});

  return { ok: true, changed: true, before, after: timelineReserved, timelineReserved };
}
