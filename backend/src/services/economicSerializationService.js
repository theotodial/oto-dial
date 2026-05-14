/**
 * Economic serialization — single serialized writer per call for reservation, interval,
 * attempt, settle, and release economics. Uses Redis lock `lock:economic:<callId>` with
 * in-process fallback, Mongo transactions when supported, and EconomicTimeline as the
 * authoritative per-call billing cursor (interval indexes, lifecycle state, consistency hash).
 *
 * CreditLedger + BillingEventJournal remain the monetary system of record; mutations here
 * always delegate to applyBillingEvent() for actual debits/credits.
 */

import { randomUUID, createHash } from "crypto";
import mongoose from "mongoose";
import EconomicTimeline from "../models/EconomicTimeline.js";
import Call from "../models/Call.js";
import User from "../models/User.js";
import { getRedisClient } from "./cache.service.js";
import { applyBillingEvent } from "./billingEnforcementGateway.js";
import { CREDIT_RULES } from "../config/creditConfig.js";
import {
  getUserProfitGuardrails,
  getReservationMultiplierFromGuardrails,
} from "./profitGuardrailService.js";

const ECON_LOCK_PREFIX = "lock:economic:";
const LOCAL_ECON_LOCKS = new Map();
const DEFAULT_ECON_LOCK_MS = Math.max(2000, Number(process.env.ECONOMIC_LOCK_LEASE_MS || 12_000));
const MAX_ECON_LOCK_WAIT_MS = Math.max(500, Number(process.env.ECONOMIC_LOCK_WAIT_MAX_MS || 25_000));
const POLL_MS = 25;

export const ECONOMIC_MUTATION = {
  RISK_PRICING: "RISK_PRICING",
  RESERVE: "RESERVE",
  ATTEMPT_CHARGE: "ATTEMPT_CHARGE",
  INTERVAL_CHARGE: "INTERVAL_CHARGE",
  SETTLE_RESERVATION: "SETTLE_RESERVATION",
  RELEASE_RESERVATION: "RELEASE_RESERVATION",
  FINALIZE: "FINALIZE",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

function isTransactionUnsupportedError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("transaction") &&
    (msg.includes("not supported") || msg.includes("replica set") || msg.includes("mongos"))
  );
}

function tryAcquireLocalEconomic(lockKey, ownerId, leaseMs) {
  const now = Date.now();
  const existing = LOCAL_ECON_LOCKS.get(lockKey);
  if (existing && existing.expiresAt > now) return false;
  LOCAL_ECON_LOCKS.set(lockKey, { ownerId, expiresAt: now + leaseMs });
  return true;
}

function releaseLocalEconomic(lockKey, ownerId) {
  const existing = LOCAL_ECON_LOCKS.get(lockKey);
  if (!existing || existing.ownerId !== ownerId) return;
  LOCAL_ECON_LOCKS.delete(lockKey);
}

async function tryAcquireRedisEconomic(lockKey, ownerId, leaseMs) {
  const client = await getRedisClient();
  if (!client?.isOpen) return { acquired: false, available: false };
  const ok = await client.set(lockKey, ownerId, { PX: leaseMs, NX: true });
  return { acquired: ok === "OK", available: true };
}

async function releaseRedisEconomic(lockKey, ownerId) {
  const client = await getRedisClient();
  if (!client?.isOpen) return;
  const current = await client.get(lockKey);
  if (current !== ownerId) return;
  await client.del(lockKey);
}

/**
 * Distributed + local fallback economic lock for a call.
 */
export async function withEconomicCallLock(callId, fn, options = {}) {
  const lockId = String(callId || "");
  if (!lockId) return { ok: false, reason: "invalid_call_id" };
  const lockKey = `${ECON_LOCK_PREFIX}${lockId}`;
  const ownerId = randomUUID();
  const leaseMs = Math.max(500, Number(options.leaseMs || DEFAULT_ECON_LOCK_MS));
  const timeoutMs = Math.min(Math.max(100, Number(options.timeoutMs || leaseMs)), MAX_ECON_LOCK_WAIT_MS);
  const started = Date.now();
  let acquired = false;
  let mode = "memory";

  while (!acquired && Date.now() - started < timeoutMs) {
    const redisTry = await tryAcquireRedisEconomic(lockKey, ownerId, leaseMs);
    if (redisTry.available) {
      mode = "redis";
      acquired = redisTry.acquired;
    } else {
      mode = "memory";
      acquired = tryAcquireLocalEconomic(lockKey, ownerId, leaseMs);
    }
    if (!acquired) await sleep(POLL_MS);
  }

  if (!acquired) {
    console.warn("[ECONOMIC FLOW]", { event: "lock_not_acquired", callId: lockId, mode, timeoutMs });
    return { ok: false, reason: "economic_lock_not_acquired" };
  }

  try {
    const value = await fn();
    return { ok: true, value };
  } finally {
    try {
      if (mode === "redis") await releaseRedisEconomic(lockKey, ownerId);
      else releaseLocalEconomic(lockKey, ownerId);
    } catch {
      /* best-effort */
    }
  }
}

function econLog(event, details = {}) {
  console.log("[ECONOMIC FLOW]", { event, ...details, t: new Date().toISOString() });
}

/**
 * Highest 1-based interval index that is fully elapsed (deterministic; floor-based).
 * @param {number} connectedSeconds
 * @param {number} [intervalSec=6]
 * @returns {number}
 */
export function maxCompletedBillableIntervalIndex(connectedSeconds, intervalSec = CREDIT_RULES.connectedIntervalSeconds) {
  const s = Math.max(0, Math.floor(Number(connectedSeconds) || 0));
  const w = Math.max(1, Number(intervalSec) || 6);
  return Math.floor(s / w);
}

/**
 * Deterministic consistency hash over timeline economics (post-mutation fields + version).
 */
export function computeEconomicConsistencyHash(t) {
  const parts = [
    Number(t.reservedCredits ?? 0).toFixed(6),
    Number(t.consumedCredits ?? 0).toFixed(6),
    Number(t.settledCredits ?? 0).toFixed(6),
    Number(t.releasedCredits ?? 0).toFixed(6),
    String(t.timelineState || ""),
    Number(t.economicVersion ?? 0),
    (t.billedIntervalIndexes || [])
      .slice()
      .sort((a, b) => a - b)
      .join(","),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Validate mutation ordering against timeline (pure; used by tests).
 */
export function validateEconomicMutationOrder(timelineLean, mutation) {
  if (!timelineLean) {
    if (mutation === ECONOMIC_MUTATION.FINALIZE) return { ok: true };
    return { ok: false, code: "TIMELINE_MISSING", message: "timeline_required" };
  }
  if (timelineLean.finalizedAt) {
    if (mutation === ECONOMIC_MUTATION.FINALIZE) return { ok: true, duplicateFinalize: true };
    return { ok: false, code: "FINALIZED", message: "timeline_finalized" };
  }
  if (mutation === ECONOMIC_MUTATION.RESERVE) {
    return { ok: true };
  }
  if (mutation === ECONOMIC_MUTATION.RISK_PRICING) {
    return { ok: true };
  }
  if (mutation === ECONOMIC_MUTATION.ATTEMPT_CHARGE || mutation === ECONOMIC_MUTATION.INTERVAL_CHARGE) {
    return { ok: true };
  }
  if (mutation === ECONOMIC_MUTATION.SETTLE_RESERVATION) {
    if (timelineLean.timelineState === "initialized") {
      return { ok: false, code: "ORDER", message: "cannot_settle_before_reserve" };
    }
    if (!["reserved", "charging", "settled", "released"].includes(timelineLean.timelineState)) {
      return { ok: false, code: "ORDER", message: "settle_requires_reserved_or_charging" };
    }
    return { ok: true };
  }
  if (mutation === ECONOMIC_MUTATION.RELEASE_RESERVATION) {
    return { ok: true };
  }
  if (mutation === ECONOMIC_MUTATION.FINALIZE) {
    return { ok: true };
  }
  return { ok: false, code: "UNKNOWN_MUTATION", message: String(mutation) };
}

async function loadTimeline(session, callId) {
  const q = EconomicTimeline.findOne({ callId });
  if (session) q.session(session);
  return q.lean();
}

function stampDocHash(doc) {
  doc.consistencyHash = computeEconomicConsistencyHash(doc);
  doc.lastEconomicEventAt = new Date();
}

async function ensureTimeline(session, userId, callId, callLean) {
  const existing = await loadTimeline(session, callId);
  if (existing) return existing;

  const uid = toObjectId(userId);
  const cid = toObjectId(callId);
  const seedIndexes = [];
  const n = Math.max(0, Math.floor(Number(callLean?.durationCreditsCharged || 0)));
  for (let i = 1; i <= n; i += 1) seedIndexes.push(i);

  const row = {
    user: uid,
    callId: cid,
    smsId: null,
    timelineId: `call:${String(cid)}`,
    economicVersion: 0,
    timelineState: "initialized",
    reservedCredits: 0,
    consumedCredits: 0,
    releasedCredits: 0,
    settledCredits: 0,
    billedIntervalIndexes: seedIndexes,
    lastEconomicEventAt: new Date(),
    finalizedAt: null,
    consistencyHash: "",
    metadata: { mutations: [], processedMutationIds: [] },
  };
  row.consistencyHash = computeEconomicConsistencyHash(row);
  const created = await EconomicTimeline.create([row], session ? { session } : {});
  const doc = created[0].toObject();
  doc._id = created[0]._id;
  return doc;
}

function pushMutation(doc, entry) {
  const m = doc.metadata && typeof doc.metadata === "object" ? { ...doc.metadata } : {};
  const arr = Array.isArray(m.mutations) ? [...m.mutations, entry] : [entry];
  m.mutations = arr.slice(-200);
  doc.metadata = m;
}

function rememberProcessedId(doc, id) {
  if (!id) return;
  const m = doc.metadata && typeof doc.metadata === "object" ? { ...doc.metadata } : {};
  const arr = Array.isArray(m.processedMutationIds) ? [...m.processedMutationIds, id] : [id];
  m.processedMutationIds = arr.slice(-50);
  doc.metadata = m;
}

function hasProcessedId(doc, id) {
  if (!id) return false;
  return (doc.metadata?.processedMutationIds || []).includes(id);
}

/**
 * Core economic mutation (call-scoped). Always runs under withEconomicCallLock by this module's public APIs.
 *
 * @param {import("mongoose").ClientSession|null} session
 * @param {object} params
 */
async function applyEconomicMutationOnce(session, params) {
  const {
    callId,
    userId,
    mutation,
    payload = {},
    sourceService = "economicSerializationService",
  } = params;

  const cid = toObjectId(callId);
  const uid = toObjectId(userId);
  if (!cid || !uid) {
    return { ok: false, code: "INVALID_IDS" };
  }

  const callLean = await Call.findById(cid)
    .select(
      "user status direction callAnsweredAt callStartedAt durationCreditsCharged attemptChargedAt creditReservationHeld"
    )
    .session(session || null)
    .lean();

  if (!callLean || String(callLean.user) !== String(uid)) {
    return { ok: false, code: "CALL_MISMATCH" };
  }

  if (payload.clientMutationId) {
    const pre = await loadTimeline(session, cid);
    if (pre && hasProcessedId(pre, payload.clientMutationId)) {
      return { ok: true, duplicate: true, reason: "duplicate_client_mutation_id" };
    }
  }

  let timeline = await ensureTimeline(session, uid, cid, callLean);

  const vCheck = validateEconomicMutationOrder(timeline, mutation);
  if (!vCheck.ok) {
    econLog("mutation_rejected", { callId: String(cid), mutation, code: vCheck.code });
    return { ok: false, code: vCheck.code, message: vCheck.message };
  }
  if (vCheck.duplicateFinalize && mutation === ECONOMIC_MUTATION.FINALIZE) {
    return { ok: true, duplicate: true, reason: "already_finalized" };
  }

  const opts = session ? { session } : {};
  const billingOpts = { session, sourceService };

  /** @type {import("mongoose").Types.ObjectId} */
  const timelineOid = timeline._id;

  const reload = async () => {
    const q = EconomicTimeline.findById(timelineOid);
    if (session) q.session(session);
    const t = await q.lean();
    if (!t) throw new Error("timeline_missing");
    return t;
  };

  let doc = await reload();
  if (payload.clientMutationId && hasProcessedId(doc, payload.clientMutationId)) {
    return { ok: true, duplicate: true, reason: "duplicate_client_mutation_id" };
  }

  doc.economicVersion = Number(doc.economicVersion || 0) + 1;

  if (mutation === ECONOMIC_MUTATION.FINALIZE) {
    if (doc.finalizedAt) {
      return { ok: true, duplicate: true, reason: "already_finalized" };
    }
    doc.timelineState = "finalized";
    doc.finalizedAt = new Date();
    pushMutation(doc, { mutation, at: doc.finalizedAt, version: doc.economicVersion });
    if (payload.clientMutationId) rememberProcessedId(doc, payload.clientMutationId);
    stampDocHash(doc);
    await EconomicTimeline.replaceOne({ _id: doc._id }, doc, opts);
    econLog("finalized", { callId: String(cid), version: doc.economicVersion });
    return { ok: true, duplicate: false, timeline: await reload() };
  }

  if (doc.finalizedAt) {
    return { ok: false, code: "FINALIZED", message: "timeline_finalized" };
  }

  if (mutation === ECONOMIC_MUTATION.RISK_PRICING) {
    const key = `call:${String(cid)}:risk-pricing`;
    const r = await applyBillingEvent({
      userId: uid,
      amount: 0,
      type: "risk_pricing_adjustment",
      callId: cid,
      direction: "outbound",
      reason: payload.reason || "risk_pricing_reservation_multiplier_applied",
      metadata: payload.metadata || {},
      idempotencyKey: key,
      allowNegative: true,
      ...billingOpts,
    });
    if (!r.ok && r.code === "INSUFFICIENT_CREDITS") return r;
    pushMutation(doc, { mutation, at: new Date(), version: doc.economicVersion, ledgerDuplicate: Boolean(r.duplicate) });
    if (payload.clientMutationId) rememberProcessedId(doc, payload.clientMutationId);
    stampDocHash(doc);
    await EconomicTimeline.replaceOne({ _id: doc._id }, doc, opts);
    return { ok: true, billing: r, timeline: await reload() };
  }

  if (mutation === ECONOMIC_MUTATION.RESERVE) {
    const hold = Math.max(0, Number(payload.hold || 0));
    const reservationKey = payload.reservationKey || `call:${String(cid)}:min-reserve`;
    const idempotencyKey = `reserve:${reservationKey}`;
    const r = await applyBillingEvent({
      userId: uid,
      amount: 0,
      type: "reservation_hold",
      reason: payload.reason || "outbound_pre_dial_reservation",
      callId: cid,
      metadata: {
        reservationKey,
        hold,
        availableBefore: payload.availableBefore,
      },
      idempotencyKey,
      allowNegative: true,
      reservedCreditsInc: hold,
      ...billingOpts,
    });
    if (!r.ok && r.code === "INSUFFICIENT_CREDITS") return r;
    if (!r.duplicate) {
      doc.reservedCredits = Number(doc.reservedCredits || 0) + hold;
    }
    doc.timelineState = "reserved";
    pushMutation(doc, { mutation, at: new Date(), version: doc.economicVersion, hold, ledgerDuplicate: Boolean(r.duplicate) });
    if (payload.clientMutationId) rememberProcessedId(doc, payload.clientMutationId);
    stampDocHash(doc);
    await EconomicTimeline.replaceOne({ _id: doc._id }, doc, opts);
    return { ok: true, billing: r, timeline: await reload() };
  }

  if (mutation === ECONOMIC_MUTATION.ATTEMPT_CHARGE) {
    const key = `call:${String(cid)}:attempt`;
    const r = await applyBillingEvent({
      userId: uid,
      amount: -CREDIT_RULES.outboundAttemptCharge,
      type: "outbound_attempt_charge",
      callId: cid,
      direction: "outbound",
      reason: payload.reason || "outbound_dial_attempt",
      metadata: payload.metadata || { rule: "attempt_charge" },
      idempotencyKey: key,
      allowNegative: false,
      ...billingOpts,
    });
    if (!r.ok && r.code === "INSUFFICIENT_CREDITS") return r;
    if (!r.duplicate) {
      doc.consumedCredits = Number(doc.consumedCredits || 0) + CREDIT_RULES.outboundAttemptCharge;
    }
    doc.timelineState = "charging";
    pushMutation(doc, { mutation, at: new Date(), version: doc.economicVersion, ledgerDuplicate: Boolean(r.duplicate) });
    if (payload.clientMutationId) rememberProcessedId(doc, payload.clientMutationId);
    stampDocHash(doc);
    await EconomicTimeline.replaceOne({ _id: doc._id }, doc, opts);
    return { ok: true, billing: r, timeline: await reload() };
  }

  if (mutation === ECONOMIC_MUTATION.INTERVAL_CHARGE) {
    const intervalIndex = Math.max(1, Math.floor(Number(payload.intervalIndex || 0)));
    const indexes = new Set((doc.billedIntervalIndexes || []).map(Number));
    if (indexes.has(intervalIndex)) {
      econLog("interval_duplicate_skipped", { callId: String(cid), intervalIndex });
      return { ok: true, duplicate: true, reason: "interval_already_billed", intervalIndex };
    }
    const key = `call:${String(cid)}:duration:${intervalIndex}`;
    const r = await applyBillingEvent({
      userId: uid,
      amount: -CREDIT_RULES.connectedIntervalCharge,
      type: "connected_duration_charge",
      callId: cid,
      direction: callLean.direction || "outbound",
      reason: payload.reason || "connected_interval_6s",
      metadata: {
        intervalIndex,
        intervalSeconds: CREDIT_RULES.connectedIntervalSeconds,
        ...(payload.metadata || {}),
      },
      idempotencyKey: key,
      allowNegative: false,
      ...billingOpts,
    });
    if (!r.ok && r.code === "INSUFFICIENT_CREDITS") return r;
    indexes.add(intervalIndex);
    doc.billedIntervalIndexes = [...indexes].sort((a, b) => a - b);
    if (!r.duplicate) {
      doc.consumedCredits = Number(doc.consumedCredits || 0) + CREDIT_RULES.connectedIntervalCharge;
    }
    doc.timelineState = "charging";
    pushMutation(doc, { mutation, at: new Date(), version: doc.economicVersion, intervalIndex, ledgerDuplicate: Boolean(r.duplicate) });
    if (payload.clientMutationId) rememberProcessedId(doc, payload.clientMutationId);
    stampDocHash(doc);
    await EconomicTimeline.replaceOne({ _id: doc._id }, doc, opts);
    return { ok: true, billing: r, intervalIndex, timeline: await reload() };
  }

  if (mutation === ECONOMIC_MUTATION.SETTLE_RESERVATION) {
    const amount = Math.max(0, Number(payload.amount || 0));
    const reservationKey = payload.reservationKey || `call:${String(cid)}:min-reserve`;
    const seq = Math.max(0, Math.floor(Number(payload.settleSequence || 0)));
    const idempotencyKey = `settle:${reservationKey}:interval:${seq}`;
    const r = await applyBillingEvent({
      userId: uid,
      amount: 0,
      type: "failed_reservation_release",
      reason: payload.reason || "call_charge_settled_from_reservation",
      callId: cid,
      metadata: {
        reservationKey,
        settle: amount,
        safeSettle: amount,
        economicSettle: true,
      },
      idempotencyKey,
      allowNegative: true,
      reservedCreditsInc: -amount,
      ...billingOpts,
    });
    if (!r.duplicate) {
      doc.settledCredits = Number(doc.settledCredits || 0) + amount;
      doc.reservedCredits = Math.max(0, Number(doc.reservedCredits || 0) - amount);
    }
    doc.timelineState = doc.timelineState === "reserved" ? "charging" : "settled";
    pushMutation(doc, { mutation, at: new Date(), version: doc.economicVersion, amount, ledgerDuplicate: Boolean(r.duplicate) });
    if (payload.clientMutationId) rememberProcessedId(doc, payload.clientMutationId);
    stampDocHash(doc);
    await EconomicTimeline.replaceOne({ _id: doc._id }, doc, opts);
    return { ok: true, billing: r, timeline: await reload() };
  }

  if (mutation === ECONOMIC_MUTATION.RELEASE_RESERVATION) {
    const reservationKey = payload.reservationKey || `call:${String(cid)}:min-reserve`;
    const release = Math.max(0, Number(payload.release || 0));
    const idempotencyKey = `release:${reservationKey}`;
    const r = await applyBillingEvent({
      userId: uid,
      amount: 0,
      type: "failed_reservation_release",
      reason: payload.reason || "call_terminal_release",
      callId: cid,
      metadata: { reservationKey, release, safeRelease: release, economicRelease: true },
      idempotencyKey,
      allowNegative: true,
      reservedCreditsInc: release > 0 ? -release : 0,
      ...billingOpts,
    });
    if (!r.duplicate && release > 0) {
      doc.releasedCredits = Number(doc.releasedCredits || 0) + release;
      doc.reservedCredits = Math.max(0, Number(doc.reservedCredits || 0) - release);
    }
    doc.timelineState = "released";
    pushMutation(doc, { mutation, at: new Date(), version: doc.economicVersion, release, ledgerDuplicate: Boolean(r.duplicate) });
    if (payload.clientMutationId) rememberProcessedId(doc, payload.clientMutationId);
    stampDocHash(doc);
    await EconomicTimeline.replaceOne({ _id: doc._id }, doc, opts);
    return { ok: true, billing: r, timeline: await reload() };
  }

  return { ok: false, code: "UNKNOWN_MUTATION" };
}

/**
 * Public API — acquires economic lock and runs mutation inside a Mongo transaction when possible.
 */
export async function applyEconomicMutation(params) {
  const callId = params.callId;
  const lock = await withEconomicCallLock(callId, async () => {
    if (mongoose.connection.readyState !== 1) {
      return applyEconomicMutationOnce(null, params);
    }
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() => applyEconomicMutationOnce(session, params));
    } catch (err) {
      if (isTransactionUnsupportedError(err)) {
        return applyEconomicMutationOnce(null, params);
      }
      throw err;
    } finally {
      await session.endSession().catch(() => {});
    }
  });
  if (!lock.ok) return { ok: false, code: lock.reason };
  return lock.value;
}

/**
 * Bill all newly completed interval indices (floor rule) under a single economic lock + transaction.
 */
export async function billConnectedDurationIntervalsSerialized(call) {
  if (!call?._id || !call?.user) return { ok: true, skipped: true };
  const ACTIVE_STATES = new Set(["answered", "in-progress"]);
  if (!ACTIVE_STATES.has(String(call.status))) {
    return { ok: true, skipped: true, reason: "not_active" };
  }
  const answeredAt = call.callAnsweredAt || call.callStartedAt;
  if (!answeredAt) return { ok: true, skipped: true, reason: "not_answered" };

  const lock = await withEconomicCallLock(call._id, async () => {
    if (mongoose.connection.readyState !== 1) {
      return runIntervalBillingBatch(null, call);
    }
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() => runIntervalBillingBatch(session, call));
    } catch (err) {
      if (isTransactionUnsupportedError(err)) {
        return runIntervalBillingBatch(null, call);
      }
      throw err;
    } finally {
      await session.endSession().catch(() => {});
    }
  });
  if (!lock.ok) return { ok: false, code: lock.reason };
  return lock.value;
}

async function runIntervalBillingBatch(session, call) {
  const cid = call._id;
  const uid = call.user;
  const fresh = await Call.findById(cid)
    .select(
      "user status direction callAnsweredAt callStartedAt durationCreditsCharged attemptChargedAt creditReservationHeld"
    )
    .session(session || null)
    .lean();
  if (!fresh) return { ok: false, code: "CALL_NOT_FOUND" };

  const answeredAt = fresh.callAnsweredAt || fresh.callStartedAt;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(answeredAt).getTime()) / 1000)
  );
  const maxIdx = maxCompletedBillableIntervalIndex(elapsedSeconds, CREDIT_RULES.connectedIntervalSeconds);

  let timeline = await ensureTimeline(session, uid, cid, fresh);
  if (timeline.finalizedAt) {
    return { ok: true, skipped: true, reason: "finalized" };
  }

  const billed = new Set((timeline.billedIntervalIndexes || []).map(Number));
  let chargedNow = 0;

  for (let idx = 1; idx <= maxIdx; idx += 1) {
    if (billed.has(idx)) continue;
    const step = await applyEconomicMutationOnce(session, {
      callId: cid,
      userId: uid,
      mutation: ECONOMIC_MUTATION.INTERVAL_CHARGE,
      payload: { intervalIndex: idx },
      sourceService: "economicSerializationService.billConnectedDurationIntervalsSerialized",
    });
    if (!step.ok && step.code === "INSUFFICIENT_CREDITS") {
      return { ok: false, code: "INSUFFICIENT_CREDITS", chargedNow };
    }
    if (step.ok && step.reason === "interval_already_billed") {
      timeline = await loadTimeline(session, cid);
      continue;
    }
    if (step.ok) {
      billed.add(idx);
      const tlNow = await loadTimeline(session, cid);
      if (
        Number(tlNow?.reservedCredits || 0) >= CREDIT_RULES.connectedIntervalCharge &&
        CREDIT_RULES.connectedIntervalCharge > 0
      ) {
        const settle = await applyEconomicMutationOnce(session, {
          callId: cid,
          userId: uid,
          mutation: ECONOMIC_MUTATION.SETTLE_RESERVATION,
          payload: {
            amount: CREDIT_RULES.connectedIntervalCharge,
            settleSequence: idx,
          },
          sourceService: "economicSerializationService.settleFromReservation",
        });
        if (!settle.ok) return settle;
      }
      if (!step.duplicate) chargedNow += 1;
    }
    timeline = await loadTimeline(session, cid);
    if (timeline?.finalizedAt) break;
  }

  if (chargedNow > 0) {
    await Call.updateOne(
      { _id: cid },
      {
        $inc: { durationCreditsCharged: chargedNow },
        $set: {
          durationBillingCursorAt: new Date(),
          durationBillingLastEventAt: new Date(),
        },
      },
      session ? { session } : {}
    );
  }

  return { ok: true, chargedNow, maxIdx };
}

/**
 * Recompute hash for a persisted timeline document (read-only).
 */
export function recomputeTimelineHashFromLean(doc) {
  if (!doc) return null;
  return computeEconomicConsistencyHash(doc);
}

/**
 * Serialized outbound reserve + optional risk pricing (same lock + transaction).
 */
export async function reserveCreditsForOutboundCallSerialized(call, options = {}) {
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    return { ok: true, skipped: true };
  }
  const lock = await withEconomicCallLock(call._id, async () => {
    if (mongoose.connection.readyState !== 1) {
      return runReserveBatch(null, call, options);
    }
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() => runReserveBatch(session, call, options));
    } catch (err) {
      if (isTransactionUnsupportedError(err)) {
        return runReserveBatch(null, call, options);
      }
      throw err;
    } finally {
      await session.endSession().catch(() => {});
    }
  });
  if (!lock.ok) return { ok: false, code: lock.reason };
  return lock.value;
}

async function runReserveBatch(session, call, options) {
  const cid = call._id;
  const uid = call.user;
  const reservationKey = `call:${String(cid)}:min-reserve`;
  const reservationMultiplier =
    Number(options?.reservationMultiplier || 0) > 0
      ? Number(options.reservationMultiplier)
      : getReservationMultiplierFromGuardrails(await getUserProfitGuardrails(uid));
  const hold = Math.max(
    CREDIT_RULES.callReservationMinimum,
    Math.ceil(CREDIT_RULES.callReservationMinimum * reservationMultiplier)
  );
  const riskPremiumCredits = Math.max(0, hold - CREDIT_RULES.callReservationMinimum);

  const uq = User.findById(uid).select("remainingCredits reservedCredits");
  if (session) uq.session(session);
  const u = await uq.lean();
  if (!u) return { ok: false, code: "USER_NOT_FOUND" };
  const remaining = Number(u.remainingCredits || 0);
  const reserved = Number(u.reservedCredits || 0);
  const available = remaining - reserved;

  if (riskPremiumCredits > 0) {
    const r0 = await applyEconomicMutationOnce(session, {
      callId: cid,
      userId: uid,
      mutation: ECONOMIC_MUTATION.RISK_PRICING,
      payload: {
        metadata: {
          reservationMultiplier,
          hold,
          baselineReservation: CREDIT_RULES.callReservationMinimum,
          riskPremiumCredits,
        },
      },
      sourceService: "economicSerializationService.reserveCreditsForOutboundCallSerialized",
    });
    if (!r0.ok) return r0;
  }

  const r1 = await applyEconomicMutationOnce(session, {
    callId: cid,
    userId: uid,
    mutation: ECONOMIC_MUTATION.RESERVE,
    payload: {
      hold,
      reservationKey,
      availableBefore: available,
      reason: "outbound_pre_dial_reservation",
    },
    sourceService: "economicSerializationService.reserveCreditsForOutboundCallSerialized",
  });
  return { ...r1, hold, reservationMultiplier };
}

/**
 * Serialized attempt charge.
 */
export async function chargeOutboundAttemptSerialized(call) {
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    return { ok: true, skipped: true };
  }
  const lock = await withEconomicCallLock(call._id, async () => {
    if (mongoose.connection.readyState !== 1) {
      return applyEconomicMutationOnce(null, {
        callId: call._id,
        userId: call.user,
        mutation: ECONOMIC_MUTATION.ATTEMPT_CHARGE,
        sourceService: "economicSerializationService.chargeOutboundAttemptSerialized",
      });
    }
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() =>
        applyEconomicMutationOnce(session, {
          callId: call._id,
          userId: call.user,
          mutation: ECONOMIC_MUTATION.ATTEMPT_CHARGE,
          sourceService: "economicSerializationService.chargeOutboundAttemptSerialized",
        })
      );
    } catch (err) {
      if (isTransactionUnsupportedError(err)) {
        return applyEconomicMutationOnce(null, {
          callId: call._id,
          userId: call.user,
          mutation: ECONOMIC_MUTATION.ATTEMPT_CHARGE,
          sourceService: "economicSerializationService.chargeOutboundAttemptSerialized",
        });
      }
      throw err;
    } finally {
      await session.endSession().catch(() => {});
    }
  });
  if (!lock.ok) return { ok: false, code: lock.reason };
  return lock.value;
}

/**
 * Serialized terminal release of unused reservation credits.
 */
export async function releaseUnusedCallReservationSerialized(call) {
  if (!call?._id || !call?.user) return { ok: true, skipped: true };
  const held = Math.max(0, Number(call.creditReservationHeld || 0));
  if (held <= 0) return { ok: true, skipped: true };

  const alreadyCharged = Math.max(
    0,
    Number(call.durationCreditsCharged || 0) + Number(call.attemptChargedAt ? 1 : 0)
  );
  const releasable = Math.max(0, held - alreadyCharged);

  const lock = await withEconomicCallLock(call._id, async () => {
    if (mongoose.connection.readyState !== 1) {
      return runReleaseBatch(null, call, releasable);
    }
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() => runReleaseBatch(session, call, releasable));
    } catch (err) {
      if (isTransactionUnsupportedError(err)) {
        return runReleaseBatch(null, call, releasable);
      }
      throw err;
    } finally {
      await session.endSession().catch(() => {});
    }
  });
  if (!lock.ok) return { ok: false, code: lock.reason };
  return lock.value;
}

async function runReleaseBatch(session, call, releasable) {
  const cid = call._id;
  const uid = call.user;
  const reservationKey = `call:${String(cid)}:min-reserve`;
  if (releasable <= 0) {
    return { ok: true, skipped: true, reason: "nothing_to_release" };
  }
  return applyEconomicMutationOnce(session, {
    callId: cid,
    userId: uid,
    mutation: ECONOMIC_MUTATION.RELEASE_RESERVATION,
    payload: { release: releasable, reservationKey, reason: "call_terminal_release" },
    sourceService: "economicSerializationService.releaseUnusedCallReservationSerialized",
  });
}

/**
 * Mark economic timeline immutable after terminal billing cleanup.
 */
export async function finalizeEconomicTimelineForCall(callId, userId) {
  return applyEconomicMutation({
    callId,
    userId,
    mutation: ECONOMIC_MUTATION.FINALIZE,
    sourceService: "economicSerializationService.finalizeEconomicTimelineForCall",
  });
}
