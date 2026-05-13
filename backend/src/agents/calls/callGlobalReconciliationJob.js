import Call from "../../models/Call.js";
import CallLifecycleEvent from "../../models/CallLifecycleEvent.js";
import {
  ACTIVE_CALL_STATUSES,
  CALL_STATES,
  normalizeCallStatus,
  mapHangupToTerminalStatus,
} from "../../utils/callStateMachine.js";
import { applyCallTransition } from "../../services/callTransitionService.js";

const AGENT = "call-global-reconciliation-job";
const HEARTBEAT_STALE_MS = Number(process.env.CALL_HEARTBEAT_STALE_MS || 120000);
const ACTIVE_STALE_MS = Number(process.env.AGENT_CALL_ACTIVE_STALE_MS || 6 * 60 * 60 * 1000);

function classifyOrphanRootCause(call, now) {
  const hb = call.lastHeartbeatAt ? now - new Date(call.lastHeartbeatAt).getTime() : null;
  const ws = call.lastClientSyncAt ? now - new Date(call.lastClientSyncAt).getTime() : null;
  const webhook = call.telnyxLastWebhookAt ? now - new Date(call.telnyxLastWebhookAt).getTime() : null;

  if (!call.lastHeartbeatAt && !call.lastClientSyncAt && !call.telnyxLastWebhookAt) return "webhook_missing";
  if (hb != null && hb > HEARTBEAT_STALE_MS) return "heartbeat_missing";
  if (ws != null && ws > HEARTBEAT_STALE_MS) return "websocket_disconnect";
  if (webhook != null && webhook > HEARTBEAT_STALE_MS * 2) return "provider_timeout";
  return "unknown";
}

export const callGlobalReconciliationJob = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_CALL_RECON_INTERVAL_MS || 2 * 60 * 1000),
  leaseMs: Number(process.env.AGENT_CALL_RECON_LEASE_MS || 75 * 1000),

  async run({ log }) {
    const nowMs = Date.now();
    const staleCutoff = new Date(nowMs - ACTIVE_STALE_MS);

    const candidates = await Call.find({
      status: { $in: ACTIVE_CALL_STATUSES },
      updatedAt: { $lte: staleCutoff },
    })
      .select(
        "_id user status updatedAt direction source callStartedAt callAnsweredAt callEndedAt telnyxCallControlId telnyxCallSessionId lastProcessedEventAt lastHeartbeatAt lastClientSyncAt telnyxLastWebhookAt hangupCause hangupCauseCode"
      )
      .limit(200)
      .lean();

    let repaired = 0;
    let scanned = candidates.length;
    for (const call of candidates) {
      const orphanRootCause = classifyOrphanRootCause(call, nowMs);
      const from = normalizeCallStatus(call.status);
      const providerKnown = Boolean(call.telnyxLastWebhookAt);
      const derivedTerminal = providerKnown
        ? mapHangupToTerminalStatus({
            hangupCause: call.hangupCause,
            hangupCauseCode: call.hangupCauseCode,
            callAnsweredAt: call.callAnsweredAt,
            callStartedAt: call.callStartedAt,
          })
        : CALL_STATES.FAILED;
      const reason = providerKnown ? "reconciliation_provider_verified" : "reconciliation_provider_missing";
      const finalOrphanRootCause = providerKnown ? orphanRootCause : "webhook_missing";

      await CallLifecycleEvent.create({
        callId: call._id,
        userId: call.user || null,
        severity: "info",
        event: reason,
        previousState: from,
        nextState: derivedTerminal,
        action: "provider_truth_check",
        details: {
          source: AGENT,
          telnyxLastWebhookAt: call.telnyxLastWebhookAt || null,
        },
      }).catch(() => {});

      const update = await applyCallTransition({
        callId: call._id,
        eventAt: new Date(),
        source: AGENT,
        eventType: "reconciliation_event",
        targetStatus: derivedTerminal,
        guard: { currentStatus: call.status, maxUpdatedAt: staleCutoff },
        set: {
          failReason:
            derivedTerminal === CALL_STATES.FAILED
              ? providerKnown
                ? call.hangupCause || "reconciliation_provider_verified"
                : "unknown-stale"
              : null,
          hangupCause:
            derivedTerminal === CALL_STATES.FAILED
              ? providerKnown
                ? call.hangupCause || "reconciliation_provider_verified"
                : "unknown-stale"
              : call.hangupCause || null,
          callEndedAt: new Date(),
          orphanRootCause: finalOrphanRootCause,
          lastReconciliationAt: new Date(),
        },
        reason: "reconciliation_safe_terminal_apply",
        details: { providerKnown, orphanRootCause: finalOrphanRootCause },
      });
      if (!update.ok) continue;
      repaired += 1;
      await CallLifecycleEvent.create({
        callId: call._id,
        userId: call.user || null,
        severity: "warning",
        event: "reconciliation_event",
        previousState: from,
        nextState: derivedTerminal,
        action: "force_terminal_repair",
        details: {
          source: AGENT,
          orphanRootCause: finalOrphanRootCause,
          staleSince: call.updatedAt,
        },
      }).catch(() => {});
    }

    log("info", "reconciliation_scan_complete", { scanned, repaired });
    return { scanned, repaired };
  },
};
