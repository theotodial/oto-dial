/**
 * Single billing authority — all credit mutations that touch CreditLedger + user balances
 * MUST flow through applyBillingEvent().
 *
 * Ordering: validate → insert CreditLedger (unique idempotencyKey) → update User aggregates
 * (including optional reservedCredits delta in the same atomic step when a session/transaction is used).
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import CreditLedger from "../models/CreditLedger.js";
import {
  recordBillingTrace,
  recordDuplicateBillingSkip,
  recordLedgerWriteFailure,
} from "./billingTraceService.js";
import { appendJournalFromCreditLedger } from "./billingEventJournal.js";

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

/**
 * Core billing mutation. Do not call CreditLedger.create / User credit fields elsewhere.
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
 * @param {number} [params.reservedCreditsInc] — $inc on User.reservedCredits (same commit as balance when transactional)
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

  const validated = validateApplyBillingEventInput(params);
  if (!validated.ok) {
    const err = new Error(validated.error);
    recordLedgerWriteFailure(err, {
      userId: params?.userId,
      idempotencyKey: params?.idempotencyKey,
      sourceService: params?.sourceService,
      type: params?.type,
    });
    throw err;
  }
  const { uid, amountNum, keyStr } = validated;
  const callObjectId = toObjectId(callId);
  const smsObjectId = toObjectId(smsId);
  const reservedDelta = Number.isFinite(Number(reservedCreditsInc)) ? Number(reservedCreditsInc) : 0;

  const runOnce = async (session) => {
    const opts = session ? { session } : {};

    const mirrorJournal = async (ledgerRow) => {
      if (!ledgerRow) return;
      await appendJournalFromCreditLedger(ledgerRow, sourceService, reservedDelta, session || null);
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
      return { ok: true, duplicate: true, ledger: existing };
    }

    const user = await User.findById(uid, null, opts);
    if (!user) {
      throw new Error("user_not_found");
    }

    const before = Number(user.remainingCredits || 0);
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
      return {
        ok: false,
        code: "INSUFFICIENT_CREDITS",
        balanceBefore: before,
        required: Math.abs(amountNum),
      };
    }

    const reservedBefore = Number(user.reservedCredits || 0);
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
        return {
          ok: false,
          code: "INSUFFICIENT_CREDITS",
          balanceBefore: before,
          reservedBefore,
          required: reservedDelta,
        };
      }
    }

    try {
      const ledgerRows = await CreditLedger.create(
        [
          {
            user: uid,
            amount: amountNum,
            type,
            balanceBefore: before,
            balanceAfter: after,
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

      const incUsed = amountNum < 0 ? Math.abs(amountNum) : 0;
      const incPurchased = amountNum > 0 ? Math.max(0, amountNum) : 0;
      const update = {
        $set: { remainingCredits: after },
      };
      const inc = {};
      if (incUsed) inc.totalCreditsUsed = incUsed;
      if (incPurchased) inc.lifetimeCreditsPurchased = incPurchased;
      if (reservedDelta) inc.reservedCredits = reservedDelta;
      if (Object.keys(inc).length) update.$inc = inc;

      await User.updateOne({ _id: uid }, update, opts);

      recordBillingTrace({
        userId: String(uid),
        callId: callObjectId ? String(callObjectId) : null,
        smsId: smsObjectId ? String(smsObjectId) : null,
        idempotencyKey: keyStr,
        beforeBalance: before,
        afterBalance: after,
        eventType: type,
        sourceService,
        duplicate: false,
        status: "posted",
      });

      await mirrorJournal(ledger);

      return { ok: true, duplicate: false, ledger };
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
        return { ok: true, duplicate: true, ledger: deduped };
      }
      recordLedgerWriteFailure(err, {
        userId: uid,
        idempotencyKey: keyStr,
        sourceService,
        type,
        callId: callObjectId,
        smsId: smsObjectId,
      });
      throw err;
    }
  };

  if (outerSession) {
    return runOnce(outerSession);
  }

  if (mongoose.connection.readyState !== 1) {
    return runOnce(null);
  }

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => runOnce(session));
  } catch (err) {
    if (isTransactionUnsupportedError(err)) {
      return runOnce(null);
    }
    recordLedgerWriteFailure(err, {
      userId: uid,
      idempotencyKey: keyStr,
      sourceService,
      type,
    });
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}
