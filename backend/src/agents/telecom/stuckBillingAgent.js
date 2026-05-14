import mongoose from "mongoose";
import Call from "../../models/Call.js";
import EconomicTimeline from "../../models/EconomicTimeline.js";
import ProfitEvent from "../../models/ProfitEvent.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";
import { recoverActiveCallEconomics } from "../../services/economicRecoveryService.js";

const AGENT = "stuck-billing-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_STUCK_BILLING_INTERVAL_MS || 11 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_STUCK_BILLING_LEASE_MS || 10 * 60 * 1000);
const ACTIVE_NO_BILLING_MS = Number(process.env.STUCK_BILLING_ACTIVE_MS || 45 * 60 * 1000);

function toOid(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) return new mongoose.Types.ObjectId(String(id));
  return null;
}

async function persistProfit(type, payload) {
  await ProfitEvent.create({
    userId: payload.userId ? toOid(payload.userId) : null,
    eventType: type,
    severity: "warning",
    payload,
    timestamp: new Date(),
  }).catch(() => {});
}

export const stuckBillingAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,

  async run({ log }) {
    const now = Date.now();
    let recoveryAttempts = 0;
    let issues = 0;

    const activeStale = await Call.find({
      direction: "outbound",
      status: { $in: ["answered", "in-progress"] },
      callAnsweredAt: { $ne: null },
      updatedAt: { $lte: new Date(now - ACTIVE_NO_BILLING_MS) },
    })
      .select("_id user updatedAt status")
      .limit(40)
      .lean();

    for (const c of activeStale) {
      const tl = await EconomicTimeline.findOne({ callId: c._id }).select("metadata.mutations finalizedAt").lean();
      if (tl?.finalizedAt) continue;
      const mutCount = Array.isArray(tl?.metadata?.mutations) ? tl.metadata.mutations.length : 0;
      if (mutCount === 0) {
        issues += 1;
        const payload = { kind: "active_no_interval_mutations", callId: String(c._id), userId: String(c.user) };
        await emitAgentAlert(AGENT, "warning", "billing_stuck_detected", payload);
        await persistProfit("billing_stuck_detected", payload);
      }
    }

    const orphanReserved = await EconomicTimeline.find({
      finalizedAt: { $ne: null },
      reservedCredits: { $gt: 0 },
    })
      .select("_id callId user reservedCredits timelineState")
      .limit(30)
      .lean();

    for (const t of orphanReserved) {
      issues += 1;
      const payload = { kind: "reservation_on_finalized_timeline", timelineId: t.timelineId, callId: String(t.callId) };
      await emitAgentAlert(AGENT, "warning", "orphan_reservation_detected", payload);
      await persistProfit("orphan_reservation_detected", { ...payload, userId: String(t.user) });
    }

    const terminalHeld = await Call.find({
      direction: "outbound",
      status: { $in: ["completed", "failed", "rejected", "canceled", "busy", "no-answer"] },
      creditReservationHeld: { $gt: 0 },
      creditReservationReleasedAt: null,
    })
      .select("_id user")
      .limit(40)
      .lean();

    for (const c of terminalHeld) {
      issues += 1;
      const payload = { kind: "terminal_active_reservation", callId: String(c._id), userId: String(c.user) };
      await emitAgentAlert(AGENT, "warning", "billing_stuck_detected", payload);
      await persistProfit("billing_stuck_detected", payload);
    }

    const activeNoTimeline = await Call.find({
      direction: "outbound",
      status: { $in: ["answered", "in-progress"] },
      callAnsweredAt: { $ne: null },
      createdAt: { $gte: new Date(now - 24 * 3600 * 1000) },
    })
      .select("_id user")
      .limit(60)
      .lean();

    for (const c of activeNoTimeline) {
      const exists = await EconomicTimeline.exists({ callId: c._id });
      if (!exists) {
        issues += 1;
        const payload = { kind: "active_call_missing_timeline", callId: String(c._id), userId: String(c.user) };
        await emitAgentAlert(AGENT, "info", "billing_stuck_detected", payload);
        await persistProfit("billing_stuck_detected", payload);
      }
    }

    const terminalTimelineActive = await EconomicTimeline.find({
      timelineState: { $nin: ["finalized", "errored"] },
      finalizedAt: null,
    })
      .select("callId user timelineState")
      .limit(50)
      .lean();

    for (const t of terminalTimelineActive) {
      const call = await Call.findById(t.callId).select("status").lean();
      if (call && ["completed", "failed", "rejected", "canceled", "busy", "no-answer"].includes(String(call.status))) {
        issues += 1;
        const payload = { kind: "terminal_call_open_timeline", callId: String(t.callId), userId: String(t.user) };
        await emitAgentAlert(AGENT, "warning", "billing_stuck_detected", payload);
        await persistProfit("billing_stuck_detected", payload);
      }
    }

    if (issues > 0) {
      const rec = await recoverActiveCallEconomics({ mode: "sweep", limit: 40 });
      recoveryAttempts = rec.processed || 0;
      const rp = { attempted: recoveryAttempts, issues };
      await emitAgentAlert(AGENT, "info", "billing_recovery_attempted", rp);
      await persistProfit("billing_recovery_attempted", rp);
      log("info", "billing_recovery_attempted", rp);
    }

    return { issues, recoveryAttempts };
  },
};
