import Call from "../../models/Call.js";
import CallLifecycleEvent from "../../models/CallLifecycleEvent.js";
import { emitAdminLiveCall } from "../../services/adminLiveEventsService.js";
import { emitUserStateResyncRequired } from "../../events/smsEvents.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";
import {
  CALL_STATES,
  ACTIVE_CALL_STATUSES,
} from "../../utils/callStateMachine.js";
import { applyCallTransition } from "../../services/callTransitionService.js";

const AGENT = "call-lifecycle-agent";
const ACTIVE_STATES = ACTIVE_CALL_STATUSES;

export const callLifecycleAgent = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_CALL_LIFECYCLE_INTERVAL_MS || 60 * 1000),
  leaseMs: Number(process.env.AGENT_CALL_LIFECYCLE_LEASE_MS || 45 * 1000),

  async run({ log }) {
    const now = Date.now();
    const ringingCutoff = new Date(now - Number(process.env.AGENT_CALL_RINGING_STALE_MS || 3 * 60 * 1000));
    const activeCutoff = new Date(now - Number(process.env.AGENT_CALL_ACTIVE_STALE_MS || 6 * 60 * 60 * 1000));

    const stuckCalls = await Call.find({
      status: { $in: [CALL_STATES.QUEUED, CALL_STATES.INITIATED, CALL_STATES.DIALING, CALL_STATES.RINGING] },
      updatedAt: { $lte: ringingCutoff },
    })
      .select("_id user status phoneNumber direction updatedAt telnyxCallControlId telnyxCallSessionId lastProcessedEventAt lastHeartbeatAt lastClientSyncAt")
      .limit(50);

    let cleaned = 0;
    for (const call of stuckCalls) {
      const eventAt = new Date();
      const result = await applyCallTransition({
        callId: call._id,
        eventAt,
        source: AGENT,
        eventType: "stale_call_cleanup",
        targetStatus: CALL_STATES.FAILED,
        guard: { currentStatus: call.status, maxUpdatedAt: ringingCutoff },
        set: {
          failReason: "agent_stale_call_cleanup",
          hangupCause: "agent_stale_call_cleanup",
          callEndedAt: new Date(),
          orphanRootCause: call.lastHeartbeatAt
            ? "heartbeat_missing"
            : call.lastClientSyncAt
              ? "websocket_disconnect"
              : "unknown",
        },
        reason: "agent_stale_call_cleanup",
      });
      if (result.ok) {
        cleaned += 1;
        await CallLifecycleEvent.create({
          callId: call._id,
          userId: call.user,
          severity: "warning",
          event: "stuck_call_force_cleanup",
          previousState: call.status,
          nextState: CALL_STATES.FAILED,
          action: "force_cleanup_stale_call",
          details: { updatedAt: call.updatedAt },
        });
        await emitAdminLiveCall({
          userId: call.user,
          callId: call._id,
          destination: call.phoneNumber,
          direction: call.direction,
          status: to,
        }).catch(() => {});
        emitUserStateResyncRequired(call.user, {
          reason: "call_lifecycle_cleanup",
          callId: String(call._id),
        });
      }
    }

    const orphanActive = await Call.countDocuments({
      status: { $in: ACTIVE_STATES },
      updatedAt: { $lte: activeCutoff },
    });

    if (cleaned > 0) {
      emitAgentAlert(AGENT, "warning", "stale_calls_cleaned", { cleaned });
    }
    if (orphanActive > 0) {
      emitAgentAlert(AGENT, "warning", "orphan_active_calls_detected", { orphanActive });
    }

    log("info", "call_lifecycle_scan_complete", { cleaned, orphanActive });
    return { cleaned, orphanActive };
  },
};
