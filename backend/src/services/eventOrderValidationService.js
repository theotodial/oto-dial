/**
 * Read-only telecom event ordering validation. Detection + forensics only.
 */

import mongoose from "mongoose";
import TelecomEventSequence from "../models/TelecomEventSequence.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import BillingEventJournal from "../models/BillingEventJournal.js";
import Call from "../models/Call.js";
import ProfitEvent from "../models/ProfitEvent.js";
import { isTerminalStatus, normalizeCallStatus } from "../utils/callStateMachine.js";
import { persistTelecomChaosSnapshot } from "./chaosSnapshotService.js";
import { chaosStructuredLog } from "../utils/chaosStructuredLog.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

async function recordViolation(ctx) {
  chaosStructuredLog("[TELECOM ORDER VIOLATION]", {
    ...ctx,
    sourcePath: "eventOrderValidationService.js",
  });
  await persistTelecomChaosSnapshot({
    snapshotType: "event_order_violation",
    callId: ctx.callId,
    userId: ctx.userId,
    workerId: ctx.workerId,
    hostname: ctx.hostname,
    processId: ctx.processId,
    economicVersion: ctx.economicVersion,
    callStateVersion: ctx.callStateVersion,
    timelineHash: ctx.timelineHash || "",
    journalHash: "",
    replayHash: "",
    metadata: ctx.metadata || {},
  });
  await ProfitEvent.create({
    userId: ctx.userId,
    eventType: "telecom_event_order_violation",
    severity: "warning",
    payload: { ...ctx.metadata, callId: ctx.callId ? String(ctx.callId) : null },
    timestamp: new Date(),
  }).catch(() => {});
}

/**
 * @param {import("mongoose").Types.ObjectId|string} callId
 * @param {object} [opts]
 * @param {string} [opts.workerId]
 */
export async function validateTelecomEventOrderingForCall(callId, opts = {}) {
  const cid = toObjectId(callId);
  if (!cid) return { ok: false, error: "invalid_call_id", violations: [] };
  const violations = [];

  const [rows, timeline, call] = await Promise.all([
    TelecomEventSequence.find({ callId: cid }).sort({ sequenceNumber: 1, receivedAt: 1 }).lean(),
    EconomicTimeline.findOne({ callId: cid }).lean(),
    Call.findById(cid).select("user status updatedAt").lean(),
  ]);

  let prevSeq = -Infinity;
  const seenSeq = new Set();
  let prevEcon = -1;
  let prevReceived = null;
  let sawTerminal = false;

  for (const r of rows) {
    const sn = Number(r.sequenceNumber);
    if (seenSeq.has(sn)) {
      violations.push({ kind: "duplicate_sequence", sequenceNumber: sn });
    }
    seenSeq.add(sn);
    if (sn < prevSeq) {
      violations.push({ kind: "sequence_regression", prev: prevSeq, current: sn });
    }
    prevSeq = sn;

    const ev = String(r.metadata?.economicVersion ?? "");
    if (ev !== "" && Number.isFinite(Number(ev))) {
      const v = Number(ev);
      if (v < prevEcon) {
        violations.push({ kind: "economic_version_regression_in_sequence", prev: prevEcon, current: v });
      }
      prevEcon = Math.max(prevEcon, v);
    }

    const ra = r.receivedAt ? new Date(r.receivedAt).getTime() : null;
    const pt = r.providerTimestamp ? new Date(r.providerTimestamp).getTime() : null;
    if (ra != null && pt != null && ra + 500 < pt) {
      violations.push({ kind: "timestamp_inversion", receivedAt: r.receivedAt, providerTimestamp: r.providerTimestamp });
    }
    if (prevReceived != null && ra != null && ra + 1 < prevReceived) {
      violations.push({ kind: "received_at_regression", prev: prevReceived, current: ra });
    }
    if (ra != null) prevReceived = ra;

    const cur = r.currentCallStatus != null ? normalizeCallStatus(r.currentCallStatus) : null;
    const nxt = r.nextCallStatus != null ? normalizeCallStatus(r.nextCallStatus) : null;
    if (cur && isTerminalStatus(cur)) sawTerminal = true;
    if (sawTerminal && nxt && !isTerminalStatus(nxt)) {
      violations.push({ kind: "terminal_reopened", nextCallStatus: nxt });
    }
  }

  if (timeline) {
    const ev = Number(timeline.economicVersion ?? 0);
    if (prevEcon >= 0 && ev < prevEcon) {
      violations.push({ kind: "timeline_economic_version_behind_sequence", timeline: ev, sequenceMax: prevEcon });
    }
    if (timeline.finalizedAt && (timeline.billedIntervalIndexes || []).length) {
      const since = new Date(timeline.finalizedAt);
      const post = await BillingEventJournal.countDocuments({
        correlationId: cid,
        eventType: "interval_charge",
        timestamp: { $gt: since },
      }).catch(() => 0);
      if (post > 0) {
        violations.push({ kind: "interval_after_finalized", count: post });
      }
    }
  }

  const ctxBase = {
    callId: cid,
    userId: call?.user || timeline?.user || null,
    workerId: opts.workerId || null,
    hostname: opts.hostname || null,
    processId: opts.processId ?? null,
    economicVersion: timeline?.economicVersion ?? null,
    callStateVersion: call ? `${new Date(call.updatedAt || 0).getTime()}:${call.status}` : null,
    timelineHash: timeline?.consistencyHash || "",
  };

  for (const v of violations) {
    await recordViolation({ ...ctxBase, metadata: v });
  }

  return { ok: violations.length === 0, violations, callId: String(cid) };
}

/**
 * Pure helper for tests / offline checks.
 */
export function auditMonotonicNumericField(values) {
  const violations = [];
  let prev = -Infinity;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (n < prev) violations.push({ prev, n });
    prev = Math.max(prev, n);
  }
  return violations;
}

/**
 * Sample recent sequence activity (distinct calls).
 */
export async function validateTelecomEventOrdering(opts = {}) {
  const limit = Math.min(40, Math.max(5, Number(opts.callSampleLimit || 15)));
  const since = new Date(Date.now() - Number(opts.sinceMs || 6 * 3600 * 1000));
  const ids = await TelecomEventSequence.distinct("callId", {
    callId: { $ne: null },
    receivedAt: { $gte: since },
  }).catch(() => []);
  const out = { checked: 0, violationCalls: 0, details: [] };
  const slice = ids.filter(Boolean).slice(0, limit);
  for (const raw of slice) {
    const r = await validateTelecomEventOrderingForCall(raw, opts);
    out.checked += 1;
    if (!r.ok) {
      out.violationCalls += 1;
      out.details.push({ callId: r.callId, violations: r.violations });
    }
  }
  return out;
}
