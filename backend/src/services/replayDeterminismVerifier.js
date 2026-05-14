/**
 * Read-only replay divergence check for a single call (journal vs timeline vs ledger tail).
 */

import mongoose from "mongoose";
import BillingEventJournal from "../models/BillingEventJournal.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import CreditLedger from "../models/CreditLedger.js";
import ProfitEvent from "../models/ProfitEvent.js";
import { replayJournalEventsSorted } from "./ledgerReconstructionService.js";
import { persistTelecomChaosSnapshot } from "./chaosSnapshotService.js";
import { chaosStructuredLog } from "../utils/chaosStructuredLog.js";
import { balancesRoughlyEqual } from "./ledgerReconstructionService.js";

const EPS = 1e-3;

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
 * @param {import("mongoose").Types.ObjectId|string} callId
 */
export async function verifyReplayDeterminismForCall(callId, opts = {}) {
  const cid = toObjectId(callId);
  if (!cid) return { ok: false, error: "invalid_call_id" };

  const [timeline, journalRows, ledgerRows] = await Promise.all([
    EconomicTimeline.findOne({ callId: cid }).lean(),
    BillingEventJournal.find({
      entityType: "call",
      $or: [{ entityId: cid }, { correlationId: cid }],
    })
      .sort({ timestamp: 1, eventId: 1 })
      .lean(),
    CreditLedger.find({ callId: cid }).sort({ createdAt: 1 }).lean(),
  ]);

  if (!timeline) {
    return { ok: true, skipped: true, reason: "no_timeline" };
  }

  const replay = replayJournalEventsSorted(journalRows);
  const journalIntervalSum = journalRows
    .filter((r) => r.eventType === "interval_charge")
    .reduce((s, r) => s + Math.abs(Math.min(0, num(r.amount))), 0);

  const billedSet = new Set((timeline.billedIntervalIndexes || []).map((x) => Number(x)));
  const journalIdx = new Set();
  for (const r of journalRows) {
    if (r.eventType !== "interval_charge") continue;
    const ix = num(r.metadata?.intervalIndex);
    if (Number.isFinite(ix) && ix > 0) journalIdx.add(ix);
  }
  const idxMismatch = [];
  if (timeline.finalizedAt) {
    for (const ix of journalIdx) {
      if (!billedSet.has(ix)) idxMismatch.push({ kind: "journal_interval_not_on_timeline_after_finalized", intervalIndex: ix });
    }
    for (const ix of billedSet) {
      if (!journalIdx.has(ix)) idxMismatch.push({ kind: "timeline_interval_missing_from_journal_after_finalized", intervalIndex: ix });
    }
  }

  let ledgerDebitSum = 0;
  for (const r of ledgerRows) {
    const delta = num(r.balanceAfter) - num(r.balanceBefore);
    if (r.type === "connected_duration_charge" || r.type === "outbound_attempt_charge") {
      ledgerDebitSum += Math.abs(Math.min(0, delta));
    }
  }

  const divergences = [];
  if (!balancesRoughlyEqual(num(timeline.consumedCredits), journalIntervalSum)) {
    divergences.push({
      kind: "timeline_vs_journal_interval_consumed",
      timelineConsumed: num(timeline.consumedCredits),
      journalIntervalDebitLikeSum: journalIntervalSum,
    });
  }
  if (idxMismatch.length) divergences.push(...idxMismatch);
  if (ledgerRows.length && !balancesRoughlyEqual(ledgerDebitSum, journalIntervalSum)) {
    divergences.push({
      kind: "ledger_vs_journal_interval_shape",
      ledgerDebitLikeSum: ledgerDebitSum,
      journalIntervalDebitLikeSum: journalIntervalSum,
    });
  }

  const ok = divergences.length === 0;
  if (!ok) {
    chaosStructuredLog("[REPLAY VERIFIER]", {
      callId: String(cid),
      userId: timeline.user ? String(timeline.user) : null,
      economicVersion: timeline.economicVersion,
      callStateVersion: opts.callStateVersion ?? null,
      timelineHash: timeline.consistencyHash || "",
      sequenceNumber: null,
      workerId: opts.workerId || null,
      hostname: opts.hostname || null,
      pid: opts.processId ?? null,
      sourcePath: "replayDeterminismVerifier.js",
      divergences,
    });
    await persistTelecomChaosSnapshot({
      snapshotType: "replay_divergence",
      callId: cid,
      userId: timeline.user,
      workerId: opts.workerId || null,
      hostname: opts.hostname || null,
      processId: opts.processId ?? null,
      economicVersion: timeline.economicVersion,
      callStateVersion: opts.callStateVersion || null,
      timelineHash: timeline.consistencyHash || "",
      journalHash: String(journalRows.length),
      replayHash: String(replay.eventCount),
      metadata: { divergences, replaySnapshot: { balance: replay.balance, reserved: replay.reserved } },
    });
    await ProfitEvent.create({
      userId: timeline.user,
      eventType: "replay_divergence",
      severity: "warning",
      payload: { callId: String(cid), divergences },
      timestamp: new Date(),
    }).catch(() => {});
  }

  return { ok, divergences, callId: String(cid) };
}

export async function verifyReplayDeterminismSample(opts = {}) {
  const configured = Number(process.env.REPLAY_VERIFY_SAMPLE_LIMIT);
  const fallback = Number.isFinite(configured) && configured > 0 ? configured : 10;
  const limit = Math.min(30, Math.max(3, Number(opts.limit != null ? opts.limit : fallback)));
  const since = new Date(Date.now() - Number(opts.sinceMs || 24 * 3600 * 1000));
  const ids = await EconomicTimeline.distinct("callId", {
    lastEconomicEventAt: { $gte: since },
  }).catch(() => []);
  const out = { checked: 0, divergent: 0 };
  for (const id of ids.filter(Boolean).slice(0, limit)) {
    const r = await verifyReplayDeterminismForCall(id, opts);
    out.checked += 1;
    if (!r.ok && !r.skipped) out.divergent += 1;
  }
  return out;
}
