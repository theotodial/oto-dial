/**
 * Single billing authority — all credit mutations that touch CreditLedger + subscription balances
 * MUST flow through applyBillingEvent().
 *
 * Ordering: validate → insert CreditLedger (unique idempotencyKey) → update Subscription aggregates
 * → sync User cache mirror.
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import CreditLedger from "../models/CreditLedger.js";
import {
  recordBillingTrace,
  recordDuplicateBillingSkip,
  recordLedgerWriteFailure,
} from "./billingTraceService.js";
import BillingEventJournal from "../models/BillingEventJournal.js";
import { appendJournalFromCreditLedger } from "./billingEventJournal.js";
import {
  billingTrace,
  billingTraceEnter,
  billingTraceExit,
  billingTraceReturn,
} from "./billingRuntimeTraceService.js";

function isDuplicateKeyError(err) {
  return err?.code === 11000;
}

function isTransactionUnsupportedError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("transaction") &&
    (msg.includes("not supported") || msg.includes("replica set") || msg.includes("mongos"))
  );
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

function toSafeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return {};
  return metadata;
}

export function normalizeIdempotencyKey(idempotencyKey) {
  return String(idempotencyKey ?? "").slice(0, 200);
}

/**
 * Pure validation for applyBillingEvent (no I/O).
 * @returns {{ ok: true, uid: import("mongoose").Types.ObjectId, amountNum: number, keyStr: string } | { ok: false, error: string }}
 */
export function validateApplyBillingEventInput(params) {
  const p = params || {};
  if (!p.userId) return { ok: false, error: "userId_required" };
  if (!p.idempotencyKey) return { ok: false, error: "idempotency_key_required" };
  if (!Number.isFinite(Number(p.amount))) return { ok: false, error: "amount_must_be_number" };
  const uid = toObjectId(p.userId);
  if (!uid) return { ok: false, error: "invalid_user_id" };
  return {
    ok: true,
    uid,
    amountNum: Number(p.amount),
    keyStr: normalizeIdempotencyKey(p.idempotencyKey),
  };
}

/**
 * Read-only economic effect: sets User.remainingCredits only when the field is unset/null.
 * Does not write CreditLedger. Use when an existing ledger row is authoritative (e.g. migration idempotency hit).
 */
export async function syncCachedRemainingCreditsIfUnset({
  userId,
  balanceAfter,
  sourceService = "syncCachedRemainingCreditsIfUnset",
}) {
  const uid = toObjectId(userId);
  if (!uid) throw new Error("invalid_user_id");
  const n = Number(balanceAfter);
  if (!Number.isFinite(n)) throw new Error("invalid_balance_after");
  const res = await User.updateOne(
    { _id: uid, $or: [{ remainingCredits: { $exists: false } }, { remainingCredits: null }] },
    { $set: { remainingCredits: n } }
  );
  recordBillingTrace({
    userId: String(uid),
    callId: null,
    smsId: null,
    idempotencyKey: `cache-sync:${String(uid)}`,
    beforeBalance: null,
    afterBalance: n,
    eventType: "cache_reconciliation",
    sourceService,
    duplicate: false,
    status: res.modifiedCount ? "cache_sync_applied" : "cache_sync_noop",
  });
  return { ok: true, matched: res.matchedCount, modified: res.modifiedCount };
}

export async function syncUserCacheFromSubscription(uid, opts = {}) {
  billingTraceEnter("billingEnforcementGateway.syncUserCacheFromSubscription", {
    userId: uid ? String(uid) : null,
    hasSession: Boolean(opts?.session),
  });
  const subscription = await Subscription.findOne({ userId: uid }, null, {
    sort: { createdAt: -1 },
    ...opts,
  }).lean();
  if (!subscription) {
    billingTraceReturn("billingEnforcementGateway.syncUserCacheFromSubscription", "subscription_not_found", {
      userId: uid ? String(uid) : null,
    });
    return { ok: false, reason: "subscription_not_found" };
  }
  const patch = {
    remainingCredits: Number(subscription.remainingCredits || 0),
    totalCreditsUsed: Number(subscription.totalCreditsUsed || 0),
    reservedCredits: Number(subscription.reservedCredits || 0),
    lifetimeCreditsPurchased: Number(subscription.lifetimeCreditsPurchased || 0),
  };
  if (!Number.isFinite(Number(patch.remainingCredits))) patch.remainingCredits = 0;
  if (!Number.isFinite(Number(patch.totalCreditsUsed))) patch.totalCreditsUsed = 0;
  if (!Number.isFinite(Number(patch.reservedCredits))) patch.reservedCredits = 0;
  if (!Number.isFinite(Number(patch.lifetimeCreditsPurchased))) patch.lifetimeCreditsPurchased = 0;
  await User.updateOne({ _id: uid }, { $set: patch }, opts);
  const out = { ok: true };
  billingTraceExit("billingEnforcementGateway.syncUserCacheFromSubscription", {
    userId: uid ? String(uid) : null,
    subscriptionId: subscription._id ? String(subscription._id) : null,
    patch,
    result: out,
  });
  return out;
}

/**
 * Core billing mutation. Do not call CreditLedger.create / Subscription credit fields elsewhere.
 *
 * @param {object} params
 * @param {string} params.idempotencyKey
 * @param {mongoose.Types.ObjectId|string} params.userId
 * @param {string} params.sourceService
 * @param {string} params.type
 * @param {number} params.amount
 * @param {boolean} [params.allowNegative]
 * @param {string|null} [params.reason]
 * @param {object} [params.metadata]
 * @param {mongoose.Types.ObjectId|string|null} [params.callId]
 * @param {mongoose.Types.ObjectId|string|null} [params.smsId]
 * @param {string|null} [params.direction]
 * @param {number} [params.reservedCreditsInc] — $inc on Subscription.reservedCredits
 * @param {import("mongoose").ClientSession|null} [params.session] — participate in outer transaction
 */
export async function applyBillingEvent(params) {
  const {
    type,
    reason = null,
    callId = null,
    smsId = null,
    direction = null,
    metadata = {},
    allowNegative = false,
    session: outerSession = null,
    sourceService = "unspecified",
    reservedCreditsInc = 0,
  } = params || {};

  billingTraceEnter("billingEnforcementGateway.applyBillingEvent", {
    callId: callId ? String(callId) : null,
    smsId: smsId ? String(smsId) : null,
    userId: params?.userId ? String(params.userId) : null,
    eventType: type || null,
    idempotencyKey: params?.idempotencyKey ? normalizeIdempotencyKey(params.idempotencyKey) : null,
    sourceService,
    amount: params?.amount,
    creditsToCharge: Number(params?.amount) < 0 ? Math.abs(Number(params?.amount)) : 0,
    reservedCreditsInc,
    allowNegative,
    hasOuterSession: Boolean(outerSession),
  });

  const validated = validateApplyBillingEventInput(params);
  if (!validated.ok) {
    const err = new Error(validated.error);
    recordLedgerWriteFailure(err, {
      userId: params?.userId,
      idempotencyKey: params?.idempotencyKey,
      sourceService: params?.sourceService,
      type: params?.type,
    });
    billingTraceReturn("billingEnforcementGateway.applyBillingEvent", validated.error, {
      callId: callId ? String(callId) : null,
      userId: params?.userId ? String(params.userId) : null,
      eventType: type || null,
      sourceService,
    });
    throw err;
  }
  const { uid, amountNum, keyStr } = validated;
  const callObjectId = toObjectId(callId);
  const smsObjectId = toObjectId(smsId);
  const reservedDelta = Number.isFinite(Number(reservedCreditsInc)) ? Number(reservedCreditsInc) : 0;

  const runOnce = async (session) => {
    const opts = session ? { session } : {};
    billingTrace("billingEnforcementGateway.applyBillingEvent", "RUN_ONCE_ENTER", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      eventType: type,
      idempotencyKey: keyStr,
      sourceService,
      amount: amountNum,
      creditsToCharge: amountNum < 0 ? Math.abs(amountNum) : 0,
      hasSession: Boolean(session),
    });

    const mirrorJournal = async (ledgerRow) => {
      if (!ledgerRow?.idempotencyKey) {
        billingTraceReturn("billingEnforcementGateway.applyBillingEvent.mirrorJournal", "missing_ledger_idempotency_key", {
          callId: callObjectId ? String(callObjectId) : null,
          userId: String(uid),
          eventType: type,
          sourceService,
        });
        return;
      }
      const journalOpts = session ? { session } : {};
      const journalExists = await BillingEventJournal.findOne(
        { eventId: keyStr },
        { _id: 1 },
        journalOpts
      ).lean();
      if (journalExists) {
        billingTraceReturn("billingEnforcementGateway.applyBillingEvent.mirrorJournal", "journal_already_exists", {
          callId: callObjectId ? String(callObjectId) : null,
          userId: String(uid),
          eventType: type,
          idempotencyKey: keyStr,
          journalId: String(journalExists._id),
        });
        return;
      }
      billingTrace("billingEnforcementGateway.applyBillingEvent", "JOURNAL_INSERT_START", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        eventType: type,
        idempotencyKey: keyStr,
      });
      await appendJournalFromCreditLedger(ledgerRow, sourceService, reservedDelta, session || null);
      billingTrace("billingEnforcementGateway.applyBillingEvent", "JOURNAL_INSERT_DONE", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        eventType: type,
        idempotencyKey: keyStr,
      });
    };

    const existing = await CreditLedger.findOne({ idempotencyKey: keyStr }, null, opts).lean();
    if (existing) {
      console.warn(
        "[billing_duplicate_event_skipped]",
        JSON.stringify({
          idempotencyKey: keyStr,
          userId: String(uid),
          type,
          sourceService,
        })
      );
      recordDuplicateBillingSkip(keyStr, {
        userId: uid,
        callId: callObjectId,
        smsId: smsObjectId,
        type,
        sourceService,
        beforeBalance: existing.balanceBefore,
        afterBalance: existing.balanceAfter,
      });
      await mirrorJournal(existing);
      await syncUserCacheFromSubscription(uid, opts).catch(() => {});
      const out = { ok: true, duplicate: true, ledger: existing };
      billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "idempotency_existing_ledger", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        eventType: type,
        idempotencyKey: keyStr,
        ledgerId: existing._id ? String(existing._id) : null,
        result: out,
      });
      return out;
    }

    const subscription = await Subscription.findOne({ userId: uid }, null, {
      sort: { createdAt: -1 },
      ...opts,
    });
    if (!subscription) {
      billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "subscription_credit_wallet_not_found", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        eventType: type,
        idempotencyKey: keyStr,
      });
      throw new Error("subscription_credit_wallet_not_found");
    }
    billingTrace("billingEnforcementGateway.applyBillingEvent", "SUBSCRIPTION_LOADED", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      subscriptionId: String(subscription._id),
      eventType: type,
      idempotencyKey: keyStr,
      remainingCredits: subscription.remainingCredits,
      reservedCredits: subscription.reservedCredits,
    });

    const before = Number(subscription.remainingCredits || 0);
    const after = before + amountNum;
    if (!allowNegative && amountNum < 0 && after < 0) {
      recordBillingTrace({
        userId: String(uid),
        callId: callObjectId ? String(callObjectId) : null,
        smsId: smsObjectId ? String(smsObjectId) : null,
        idempotencyKey: keyStr,
        beforeBalance: before,
        afterBalance: before,
        eventType: type,
        sourceService,
        duplicate: false,
        status: "insufficient_credits",
      });
      const out = {
        ok: false,
        code: "INSUFFICIENT_CREDITS",
        balanceBefore: before,
        required: Math.abs(amountNum),
      };
      billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "insufficient_credits", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        subscriptionId: String(subscription._id),
        eventType: type,
        idempotencyKey: keyStr,
        result: out,
      });
      return out;
    }

    const reservedBefore = Number(subscription.reservedCredits || 0);
    if (reservedDelta > 0) {
      const available = before - reservedBefore;
      if (available < reservedDelta) {
        recordBillingTrace({
          userId: String(uid),
          callId: callObjectId ? String(callObjectId) : null,
          smsId: smsObjectId ? String(smsObjectId) : null,
          idempotencyKey: keyStr,
          beforeBalance: before,
          afterBalance: before,
          eventType: type,
          sourceService,
          duplicate: false,
          status: "insufficient_credits_reservation",
        });
        const out = {
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          balanceBefore: before,
          reservedBefore,
          required: reservedDelta,
        };
        billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "insufficient_credits_reservation", {
          callId: callObjectId ? String(callObjectId) : null,
          userId: String(uid),
          subscriptionId: String(subscription._id),
          eventType: type,
          idempotencyKey: keyStr,
          result: out,
        });
        return out;
      }
    }

    const incUsed = amountNum < 0 ? Math.abs(amountNum) : 0;
    const incPurchased = amountNum > 0 ? Math.max(0, amountNum) : 0;
    const walletInc = {
      remainingCredits: amountNum,
      telecomCredits: amountNum,
    };
    if (incUsed) walletInc.totalCreditsUsed = incUsed;
    if (incPurchased) walletInc.lifetimeCreditsPurchased = incPurchased;
    if (reservedDelta !== 0) walletInc.reservedCredits = reservedDelta;

    const walletFilter = { _id: subscription._id };
    if (!allowNegative && amountNum < 0) {
      walletFilter.remainingCredits = { $gte: Math.abs(amountNum) };
    }

    try {
      billingTrace("billingEnforcementGateway.applyBillingEvent", "SUBSCRIPTION_UPDATE_START", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        subscriptionId: String(subscription._id),
        eventType: type,
        idempotencyKey: keyStr,
        walletFilter,
        walletInc,
      });
      const beforeDoc = await Subscription.findOneAndUpdate(
        walletFilter,
        { $inc: walletInc },
        { new: false, ...opts }
      );
      if (!beforeDoc) {
        recordBillingTrace({
          userId: String(uid),
          callId: callObjectId ? String(callObjectId) : null,
          smsId: smsObjectId ? String(smsObjectId) : null,
          idempotencyKey: keyStr,
          beforeBalance: before,
          afterBalance: before,
          eventType: type,
          sourceService,
          duplicate: false,
          status: "insufficient_credits_race",
        });
        const out = {
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          balanceBefore: before,
          required: amountNum < 0 ? Math.abs(amountNum) : 0,
        };
        billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "insufficient_credits_race", {
          callId: callObjectId ? String(callObjectId) : null,
          userId: String(uid),
          subscriptionId: String(subscription._id),
          eventType: type,
          idempotencyKey: keyStr,
          result: out,
        });
        return out;
      }

      const balanceBefore = Number(beforeDoc.remainingCredits || 0);
      const balanceAfter = balanceBefore + amountNum;

      billingTrace("billingEnforcementGateway.applyBillingEvent", "LEDGER_INSERT_START", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        subscriptionId: String(subscription._id),
        eventType: type,
        idempotencyKey: keyStr,
        amount: amountNum,
        balanceBefore,
        balanceAfter,
      });
      const ledgerRows = await CreditLedger.create(
        [
          {
            user: uid,
            amount: amountNum,
            type,
            balanceBefore,
            balanceAfter,
            callId: callObjectId,
            smsId: smsObjectId,
            direction: direction || null,
            reason,
            metadata: toSafeMetadata(metadata),
            idempotencyKey: keyStr,
            createdAt: new Date(),
          },
        ],
        opts
      );
      const ledger = ledgerRows[0];
      billingTrace("billingEnforcementGateway.applyBillingEvent", "LEDGER_INSERT_DONE", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        subscriptionId: String(subscription._id),
        eventType: type,
        idempotencyKey: keyStr,
        ledgerId: ledger?._id ? String(ledger._id) : null,
        balanceBefore,
        balanceAfter,
      });

      billingTrace("billingEnforcementGateway.applyBillingEvent", "USER_CACHE_UPDATE_START", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        subscriptionId: String(subscription._id),
        eventType: type,
        idempotencyKey: keyStr,
      });
      await syncUserCacheFromSubscription(uid, opts).catch(() => {});
      billingTrace("billingEnforcementGateway.applyBillingEvent", "USER_CACHE_UPDATE_DONE", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        subscriptionId: String(subscription._id),
        eventType: type,
        idempotencyKey: keyStr,
      });

      recordBillingTrace({
        userId: String(uid),
        callId: callObjectId ? String(callObjectId) : null,
        smsId: smsObjectId ? String(smsObjectId) : null,
        idempotencyKey: keyStr,
        beforeBalance: balanceBefore,
        afterBalance: balanceAfter,
        eventType: type,
        sourceService,
        duplicate: false,
        status: "posted",
      });

      await mirrorJournal(ledger);

      const out = { ok: true, duplicate: false, ledger };
      billingTraceExit("billingEnforcementGateway.applyBillingEvent", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        subscriptionId: String(subscription._id),
        eventType: type,
        idempotencyKey: keyStr,
        result: out,
      });
      return out;
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const deduped = await CreditLedger.findOne({ idempotencyKey: keyStr }, null, opts).lean();
        console.warn(
          "[billing_duplicate_event_skipped]",
          JSON.stringify({
            idempotencyKey: keyStr,
            userId: String(uid),
            type,
            sourceService,
            reason: "unique_index_race",
          })
        );
        recordDuplicateBillingSkip(keyStr, {
          userId: uid,
          callId: callObjectId,
          smsId: smsObjectId,
          type,
          sourceService,
          beforeBalance: deduped?.balanceBefore,
          afterBalance: deduped?.balanceAfter,
        });
        await mirrorJournal(deduped);
        await syncUserCacheFromSubscription(uid, opts).catch(() => {});
        const out = { ok: true, duplicate: true, ledger: deduped };
        billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "duplicate_key_race", {
          callId: callObjectId ? String(callObjectId) : null,
          userId: String(uid),
          eventType: type,
          idempotencyKey: keyStr,
          ledgerId: deduped?._id ? String(deduped._id) : null,
          error: err?.message || String(err),
          result: out,
        });
        return out;
      }
      recordLedgerWriteFailure(err, {
        userId: uid,
        idempotencyKey: keyStr,
        sourceService,
        type,
        callId: callObjectId,
        smsId: smsObjectId,
      });
      billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "ledger_write_exception", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        eventType: type,
        idempotencyKey: keyStr,
        error: err?.message || String(err),
      });
      throw err;
    }
  };

  if (outerSession) {
    billingTrace("billingEnforcementGateway.applyBillingEvent", "USING_OUTER_SESSION", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      eventType: type,
      idempotencyKey: keyStr,
    });
    return runOnce(outerSession);
  }

  if (mongoose.connection.readyState !== 1) {
    billingTrace("billingEnforcementGateway.applyBillingEvent", "NO_MONGO_TRANSACTION_CONNECTION_NOT_READY", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      eventType: type,
      idempotencyKey: keyStr,
      readyState: mongoose.connection.readyState,
    });
    return runOnce(null);
  }

  const session = await mongoose.startSession();
  try {
    billingTrace("billingEnforcementGateway.applyBillingEvent", "TRANSACTION_START", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      eventType: type,
      idempotencyKey: keyStr,
    });
    const result = await session.withTransaction(() => runOnce(session));
    billingTrace("billingEnforcementGateway.applyBillingEvent", "TRANSACTION_COMMIT", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      eventType: type,
      idempotencyKey: keyStr,
      result,
    });
    return result;
  } catch (err) {
    if (isTransactionUnsupportedError(err)) {
      billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "transaction_unsupported_fallback_no_session", {
        callId: callObjectId ? String(callObjectId) : null,
        userId: String(uid),
        eventType: type,
        idempotencyKey: keyStr,
        error: err?.message || String(err),
      });
      return runOnce(null);
    }
    recordLedgerWriteFailure(err, {
      userId: uid,
      idempotencyKey: keyStr,
      sourceService,
      type,
    });
    billingTraceReturn("billingEnforcementGateway.applyBillingEvent", "transaction_aborted", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      eventType: type,
      idempotencyKey: keyStr,
      error: err?.message || String(err),
    });
    throw err;
  } finally {
    await session.endSession().catch(() => {});
    billingTrace("billingEnforcementGateway.applyBillingEvent", "TRANSACTION_SESSION_END", {
      callId: callObjectId ? String(callObjectId) : null,
      userId: String(uid),
      eventType: type,
      idempotencyKey: keyStr,
    });
  }
}
