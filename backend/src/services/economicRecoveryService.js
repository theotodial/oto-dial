/**
 * Safe active-call economic recovery: re-run serialized interval billing for stale or
 * post-restart calls. Never finalizes timelines or invents new interval indices.
 */

import Call from "../models/Call.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import { BILLING_MATRIX_CALL_SOURCE } from "../config/creditConfig.js";

const TICK_MS = Number(process.env.CALL_CREDIT_TICK_MS || 6000);

function recoveryLog(event, details = {}) {
  console.log("[ECONOMIC RECOVERY]", { event, ...details, t: new Date().toISOString() });
}

/**
 * @param {object} [options]
 * @param {"startup"|"sweep"|"single"} [options.mode]
 * @param {string} [options.callId] — when mode=single
 * @param {number} [options.limit]
 * @param {number} [options.staleTickMultiplier]
 */
export async function recoverActiveCallEconomics(options = {}) {
  const mode = options.mode || "sweep";
  const limit = Math.min(500, Math.max(5, Number(options.limit || 120)));
  const staleMult = Math.max(1, Number(options.staleTickMultiplier ?? process.env.RECOVERY_STALE_TICK_MULTIPLIER ?? 2));
  const maxAgeMs = Number(process.env.ECONOMIC_RECOVERY_MAX_CALL_AGE_MS || 48 * 3600 * 1000);
  const now = Date.now();

  if (mode === "single" && options.callId) {
    const live = await Call.findById(options.callId).lean();
    if (!live) {
      recoveryLog("single_skip", { reason: "call_not_found", callId: String(options.callId) });
      return { mode, processed: 0, results: [], reason: "call_not_found" };
    }
    const answeredAt = live.callAnsweredAt || live.callStartedAt;
    const isActive = ["answered", "in-progress"].includes(String(live.status || ""));
    if (!isActive && !answeredAt) {
      recoveryLog("single_skip", { reason: "not_billable", callId: String(live._id), status: live.status });
      return { mode, processed: 0, results: [], reason: "not_billable_call" };
    }
    const tl = await EconomicTimeline.findOne({ callId: live._id }).select("finalizedAt").lean();
    if (tl?.finalizedAt && !answeredAt) {
      recoveryLog("single_skip", { reason: "finalized", callId: String(live._id) });
      return { mode, processed: 0, results: [], reason: "timeline_finalized" };
    }
    const { billConnectedDurationIntervals } = await import("./callCreditBillingService.js");
    const r = await billConnectedDurationIntervals(live);
    recoveryLog("single_applied", { callId: String(live._id), result: r });
    return { mode, processed: 1, results: [{ callId: String(live._id), ok: true, result: r }] };
  }

  const q = {
    direction: "outbound",
    status: { $in: ["answered", "in-progress"] },
    source: { $ne: BILLING_MATRIX_CALL_SOURCE },
    createdAt: { $gte: new Date(now - maxAgeMs) },
  };
  if (mode === "sweep") {
    q.updatedAt = { $lte: new Date(now - staleMult * TICK_MS) };
  }

  const calls = await Call.find(q)
    .select("_id user status updatedAt callAnsweredAt callStartedAt durationCreditsCharged")
    .limit(limit)
    .lean();

  const results = [];
  for (const c of calls) {
    const tl = await EconomicTimeline.findOne({ callId: c._id }).select("finalizedAt").lean();
    if (tl?.finalizedAt) continue;

    const live = await Call.findById(c._id).lean();
    if (!live) continue;
    const answeredAt = live.callAnsweredAt || live.callStartedAt;
    const isActive = ["answered", "in-progress"].includes(String(live.status || ""));
    if (!isActive && !answeredAt) continue;

    try {
      const { billConnectedDurationIntervals } = await import("./callCreditBillingService.js");
      const r = await billConnectedDurationIntervals(live);
      results.push({ callId: String(c._id), ok: true, result: r });
      recoveryLog("recovered", { callId: String(c._id), mode, chargedNow: r?.chargedNow });
    } catch (err) {
      results.push({ callId: String(c._id), ok: false, error: err?.message || String(err) });
      recoveryLog("recover_failed", { callId: String(c._id), error: err?.message || String(err) });
    }
  }

  recoveryLog("batch_complete", { mode, count: results.length });
  return { mode, processed: results.length, results };
}
