import mongoose from "mongoose";
import BillingEventJournal from "../models/BillingEventJournal.js";
import CreditLedger from "../models/CreditLedger.js";

const EPS = 1e-4;

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
 * Pure replay of journal rows (already sorted). Used by admin API and tests.
 * Rules mirror append semantics: reserve/release/settle adjust reserved; monetary types adjust balance.
 */
export function replayJournalEventsSorted(rows) {
  let balance = 0;
  let reserved = 0;
  let totalConsumed = 0;

  for (const e of rows) {
    const amt = num(e.amount);
    const et = String(e.eventType || "");

    if (et === "reserve") {
      const rd = num(
        e.metadata?.reservedDelta ?? e.metadata?.hold ?? e.metadata?.reservedCreditsInc
      );
      reserved += rd;
      balance += amt;
    } else if (et === "release") {
      const rel = num(e.metadata?.safeRelease ?? e.metadata?.release);
      reserved = Math.max(0, reserved - rel);
      balance += amt;
    } else if (et === "settle") {
      const st = num(e.metadata?.safeSettle ?? e.metadata?.settle);
      reserved = Math.max(0, reserved - st);
      balance += amt;
    } else if (
      et === "attempt_charge" ||
      et === "interval_charge" ||
      et === "sms_charge" ||
      et === "refund" ||
      et === "grant"
    ) {
      balance += amt;
      if (amt < 0) totalConsumed += -amt;
    } else {
      balance += amt;
      if (amt < 0) totalConsumed += -amt;
    }
  }

  return { balance, reserved, totalConsumed, eventCount: rows.length };
}

/**
 * Read-only: replay BillingEventJournal for user in strict (timestamp, eventId) order.
 * @param {import("mongoose").Types.ObjectId|string} userId
 */
export async function rebuildUserBalanceFromJournal(userId) {
  const uid = toObjectId(userId);
  if (!uid) {
    return {
      ok: false,
      error: "invalid_user_id",
      balance: null,
      reserved: null,
      totalConsumed: null,
      eventCount: 0,
    };
  }
  const rows = await BillingEventJournal.find({ userId: uid })
    .sort({ timestamp: 1, eventId: 1 })
    .lean();
  const replay = replayJournalEventsSorted(rows);
  return { ok: true, userId: String(uid), ...replay };
}

/**
 * Read-only: replay CreditLedger chain in createdAt order; balance = last balanceAfter.
 * Optionally validates balanceBefore chain against running balance.
 */
export async function rebuildBalanceFromCreditLedger(userId) {
  const uid = toObjectId(userId);
  if (!uid) {
    return { ok: false, error: "invalid_user_id", balance: null, rowCount: 0, chainValid: false };
  }
  const rows = await CreditLedger.find({ user: uid }).sort({ createdAt: 1, _id: 1 }).lean();
  if (!rows.length) {
    return { ok: true, balance: 0, rowCount: 0, chainValid: true, reservedHint: 0 };
  }

  let running = num(rows[0].balanceBefore);
  let chainValid = true;
  let reservedHint = 0;

  for (const r of rows) {
    if (Math.abs(num(r.balanceBefore) - running) > EPS) {
      chainValid = false;
    }
    if (r.type === "reservation_hold") {
      reservedHint += num(r.metadata?.hold);
    } else if (r.type === "failed_reservation_release") {
      const rel = num(r.metadata?.safeRelease);
      const st = num(r.metadata?.safeSettle);
      reservedHint = Math.max(0, reservedHint - Math.max(rel, st));
    }
    running = num(r.balanceAfter);
  }

  return {
    ok: true,
    balance: running,
    rowCount: rows.length,
    chainValid,
    reservedHint,
  };
}

export function balancesRoughlyEqual(a, b) {
  return Math.abs(num(a) - num(b)) <= EPS;
}
