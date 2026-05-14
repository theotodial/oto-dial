import ProfitEvent from "../../models/ProfitEvent.js";
import { findStaleActiveCallCandidates, reviewStaleActiveCall } from "../../services/staleActiveCallRecoveryService.js";
import { claimAgentExecution, releaseAgentExecution } from "../../services/distributedAgentCoordinator.js";

const AGENT = "active-session-reconciliation-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_ACTIVE_SESSION_INTERVAL_MS || 5 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_ACTIVE_SESSION_LEASE_MS || 4 * 60 * 1000);

async function emitProfit(eventType, payload) {
  await ProfitEvent.create({
    userId: payload.userId || null,
    eventType,
    severity: "warning",
    payload,
  }).catch(() => {});
}

export const activeSessionReconciliationAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,

  async run({ log }) {
    const coord = await claimAgentExecution(AGENT, LEASE_MS);
    if (!coord.acquired) {
      log("info", "coordination_skip", { source: coord.source });
      return { skipped: true };
    }
    try {
      const { candidates, reviewed } = await findStaleActiveCallCandidates(30);
      let sessions = 0;
      let ghosts = 0;
      for (const c of candidates) {
        if (!c.userId) continue;
        if (c.reasons.includes("no_billing_progress")) {
          ghosts += 1;
          await emitProfit("ghost_call_detected", { callId: c.callId, userId: c.userId, reasons: c.reasons });
          log("warning", "ghost_call_detected", c);
          await emitProfit("stale_webrtc_session", {
            callId: c.callId,
            userId: c.userId,
            reasons: c.reasons,
          });
        } else {
          sessions += 1;
          await emitProfit("session_drift_detected", { callId: c.callId, userId: c.userId, reasons: c.reasons });
          log("warning", "session_drift_detected", c);
        }
        await reviewStaleActiveCall(c.callId).catch((e) =>
          log("warning", "stale_review_failed", { callId: c.callId, error: String(e?.message || e) })
        );
      }
      return { reviewed, candidates: candidates.length, sessions, ghosts };
    } finally {
      if (coord.source === "redis") await releaseAgentExecution(AGENT, coord.ownerId);
    }
  },
};
