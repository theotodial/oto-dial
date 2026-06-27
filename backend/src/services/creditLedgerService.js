/**
 * Low-level reservation / settlement helpers backed by applyBillingEvent().
 * Call-scoped outbound economics (reserve, release, per-call interval settle) are serialized
 * through economicSerializationService — prefer callCreditBillingService for call paths.
 */
import mongoose from "mongoose";
import Subscription from "../models/Subscription.js";
import { applyBillingEvent } from "./billingEnforcementGateway.js";
import {
  billingTraceEnter,
  billingTraceExit,
  billingTraceReturn,
} from "./billingRuntimeTraceService.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

export async function getUserCreditSnapshot(userId) {
  billingTraceEnter("creditLedgerService.getUserCreditSnapshot", {
    userId: userId ? String(userId) : null,
  });
  const uid = toObjectId(userId);
  if (!uid) {
    billingTraceReturn("creditLedgerService.getUserCreditSnapshot", "invalid_user_id", {
      userId: userId ? String(userId) : null,
    });
    return null;
  }
  const subscription = await Subscription.findOne({ userId: uid })
    .sort({ createdAt: -1 })
    .select("remainingCredits totalCreditsUsed reservedCredits lifetimeCreditsPurchased")
    .lean();
  if (!subscription) {
    billingTraceReturn("creditLedgerService.getUserCreditSnapshot", "subscription_not_found", {
      userId: String(uid),
    });
    return null;
  }
  const source = subscription;
  const out = {
    remainingCredits: Number(source.remainingCredits || 0),
    totalCreditsUsed: Number(source.totalCreditsUsed || 0),
    reservedCredits: Number(source.reservedCredits || 0),
    lifetimeCreditsPurchased: Number(source.lifetimeCreditsPurchased || 0),
  };
  billingTraceExit("creditLedgerService.getUserCreditSnapshot", {
    userId: String(uid),
    result: out,
  });
  return out;
}

export async function getLatestSubscriptionCreditSnapshot(userId) {
  billingTraceEnter("creditLedgerService.getLatestSubscriptionCreditSnapshot", {
    userId: userId ? String(userId) : null,
  });
  const uid = toObjectId(userId);
  if (!uid) {
    billingTraceReturn("creditLedgerService.getLatestSubscriptionCreditSnapshot", "invalid_user_id", {
      userId: userId ? String(userId) : null,
    });
    return null;
  }
  const subscription = await Subscription.findOne({ userId: uid })
    .sort({ createdAt: -1 })
    .select("_id remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased telecomCredits")
    .lean();
  if (!subscription?._id) {
    billingTraceReturn("creditLedgerService.getLatestSubscriptionCreditSnapshot", "subscription_not_found", {
      userId: String(uid),
    });
    return null;
  }
  const out = {
    subscriptionId: String(subscription._id),
    remainingCredits: Number(subscription.remainingCredits || 0),
    reservedCredits: Number(subscription.reservedCredits || 0),
    totalCreditsUsed: Number(subscription.totalCreditsUsed || 0),
    lifetimeCreditsPurchased: Number(subscription.lifetimeCreditsPurchased || 0),
    telecomCredits: Number(subscription.telecomCredits || 0),
  };
  billingTraceExit("creditLedgerService.getLatestSubscriptionCreditSnapshot", {
    userId: String(uid),
    subscriptionId: String(subscription._id),
    result: out,
  });
  return out;
}

export async function reserveUserCredits({
  userId,
  amount,
  reservationKey,
  callId = null,
  reason = "reservation_hold",
  session = null,
}) {
  billingTraceEnter("creditLedgerService.reserveUserCredits", {
    userId: userId ? String(userId) : null,
    callId: callId ? String(callId) : null,
    amount,
    reservationKey,
    reason,
    hasSession: Boolean(session),
  });
  if (!reservationKey) {
    billingTraceReturn("creditLedgerService.reserveUserCredits", "reservation_key_required", {
      userId: userId ? String(userId) : null,
      callId: callId ? String(callId) : null,
    });
    throw new Error("reservation_key_required");
  }
  const hold = Math.max(0, Number(amount || 0));
  if (hold <= 0) {
    billingTraceReturn("creditLedgerService.reserveUserCredits", "credits_lte_zero", {
      userId: userId ? String(userId) : null,
      callId: callId ? String(callId) : null,
      hold,
    });
    return { ok: true, skipped: true };
  }
  const idempotencyKey = `reserve:${reservationKey}`;
  const uid = toObjectId(userId);
  const sub = await Subscription.findOne({ userId: uid }, null, {
    sort: { createdAt: -1 },
    ...(session ? { session } : {}),
  }).lean();
  if (!sub) {
    billingTraceReturn("creditLedgerService.reserveUserCredits", "subscription_credit_wallet_missing", {
      userId: uid ? String(uid) : null,
      callId: callId ? String(callId) : null,
      reservationKey,
    });
    return { ok: false, code: "SUBSCRIPTION_CREDIT_WALLET_MISSING" };
  }
  const remaining = Number(sub.remainingCredits || 0);
  const reserved = Number(sub.reservedCredits || 0);
  const available = remaining - reserved;
  if (available < hold) {
    const out = {
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      balanceBefore: remaining,
      reservedBefore: reserved,
      required: hold,
    };
    billingTraceReturn("creditLedgerService.reserveUserCredits", "insufficient_credits", {
      userId: uid ? String(uid) : null,
      callId: callId ? String(callId) : null,
      subscriptionId: sub._id ? String(sub._id) : null,
      reservationKey,
      result: out,
    });
    return out;
  }
  const result = await applyBillingEvent({
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
  billingTraceExit("creditLedgerService.reserveUserCredits", {
    userId: uid ? String(uid) : null,
    callId: callId ? String(callId) : null,
    subscriptionId: sub._id ? String(sub._id) : null,
    reservationKey,
    hold,
    result,
  });
  return result;
}

export async function releaseReservedCredits({
  userId,
  amount,
  reservationKey,
  callId = null,
  reason = "failed_reservation_release",
  session = null,
}) {
  billingTraceEnter("creditLedgerService.releaseReservedCredits", {
    userId: userId ? String(userId) : null,
    callId: callId ? String(callId) : null,
    amount,
    reservationKey,
    reason,
    hasSession: Boolean(session),
  });
  if (!reservationKey) {
    billingTraceReturn("creditLedgerService.releaseReservedCredits", "reservation_key_required", {
      userId: userId ? String(userId) : null,
      callId: callId ? String(callId) : null,
    });
    throw new Error("reservation_key_required");
  }
  const release = Math.max(0, Number(amount || 0));
  if (release <= 0) {
    billingTraceReturn("creditLedgerService.releaseReservedCredits", "credits_lte_zero", {
      userId: userId ? String(userId) : null,
      callId: callId ? String(callId) : null,
      release,
    });
    return { ok: true, skipped: true };
  }
  const idempotencyKey = `release:${reservationKey}`;
  const uid = toObjectId(userId);
  const sub = await Subscription.findOne({ userId: uid }, null, {
    sort: { createdAt: -1 },
    ...(session ? { session } : {}),
  }).lean();
  if (!sub) {
    billingTraceReturn("creditLedgerService.releaseReservedCredits", "subscription_credit_wallet_missing", {
      userId: uid ? String(uid) : null,
      callId: callId ? String(callId) : null,
      reservationKey,
    });
    return { ok: false, code: "SUBSCRIPTION_CREDIT_WALLET_MISSING" };
  }
  const safeRelease = Math.min(release, Math.max(0, Number(sub?.reservedCredits || 0)));
  if (safeRelease <= 0) {
    const result = await applyBillingEvent({
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
    billingTraceExit("creditLedgerService.releaseReservedCredits", {
      userId: uid ? String(uid) : null,
      callId: callId ? String(callId) : null,
      subscriptionId: sub._id ? String(sub._id) : null,
      reservationKey,
      release,
      safeRelease,
      result,
    });
    return result;
  }
  const result = await applyBillingEvent({
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
  billingTraceExit("creditLedgerService.releaseReservedCredits", {
    userId: uid ? String(uid) : null,
    callId: callId ? String(callId) : null,
    subscriptionId: sub._id ? String(sub._id) : null,
    reservationKey,
    release,
    safeRelease,
    result,
  });
  return result;
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
  billingTraceEnter("creditLedgerService.settleReservedCredits", {
    userId: userId ? String(userId) : null,
    callId: callId ? String(callId) : null,
    smsId: smsId ? String(smsId) : null,
    amount,
    reservationKey,
    reason,
    hasSession: Boolean(session),
  });
  if (!reservationKey) {
    billingTraceReturn("creditLedgerService.settleReservedCredits", "reservation_key_required", {
      userId: userId ? String(userId) : null,
      callId: callId ? String(callId) : null,
      smsId: smsId ? String(smsId) : null,
    });
    throw new Error("reservation_key_required");
  }
  const settle = Math.max(0, Number(amount || 0));
  if (settle <= 0) {
    billingTraceReturn("creditLedgerService.settleReservedCredits", "credits_lte_zero", {
      userId: userId ? String(userId) : null,
      callId: callId ? String(callId) : null,
      smsId: smsId ? String(smsId) : null,
      settle,
    });
    return { ok: true, skipped: true };
  }
  const idempotencyKey = `settle:${reservationKey}`;
  const uid = toObjectId(userId);
  const sub = await Subscription.findOne({ userId: uid }, null, {
    sort: { createdAt: -1 },
    ...(session ? { session } : {}),
  }).lean();
  if (!sub) {
    billingTraceReturn("creditLedgerService.settleReservedCredits", "subscription_credit_wallet_missing", {
      userId: uid ? String(uid) : null,
      callId: callId ? String(callId) : null,
      smsId: smsId ? String(smsId) : null,
      reservationKey,
    });
    return { ok: false, code: "SUBSCRIPTION_CREDIT_WALLET_MISSING" };
  }
  const safeSettle = Math.min(settle, Math.max(0, Number(sub?.reservedCredits || 0)));
  if (safeSettle <= 0) {
    const result = await applyBillingEvent({
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
    billingTraceExit("creditLedgerService.settleReservedCredits", {
      userId: uid ? String(uid) : null,
      callId: callId ? String(callId) : null,
      smsId: smsId ? String(smsId) : null,
      subscriptionId: sub._id ? String(sub._id) : null,
      reservationKey,
      settle,
      safeSettle,
      result,
    });
    return result;
  }
  const result = await applyBillingEvent({
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
  billingTraceExit("creditLedgerService.settleReservedCredits", {
    userId: uid ? String(uid) : null,
    callId: callId ? String(callId) : null,
    smsId: smsId ? String(smsId) : null,
    subscriptionId: sub._id ? String(sub._id) : null,
    reservationKey,
    settle,
    safeSettle,
    result,
  });
  return result;
}
