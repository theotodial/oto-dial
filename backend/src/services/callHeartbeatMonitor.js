import Call from "../models/Call.js";
import { CALL_STATES } from "../utils/callStateMachine.js";
import { applyCallTransition } from "./callTransitionService.js";
import { telecomStructuredLog } from "../utils/telecomStructuredLog.js";

const TICK_MS = Number(process.env.CALL_HEARTBEAT_TICK_MS || 45000);
const STALE_MS = Number(process.env.CALL_HEARTBEAT_STALE_MS || 120000);

/**
 * Marks outbound WebRTC calls failed when the client stops sending heartbeats.
 * Only affects rows where `lastHeartbeatAt` was set (new clients); legacy sessions are untouched.
 */
export function startCallHeartbeatMonitor() {
  const timer = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_MS);
      const victims = await Call.find({
        direction: "outbound",
        source: "webrtc",
        status: {
          $in: ["queued", "initiated", "dialing", "ringing", "in-progress", "answered"],
        },
        lastHeartbeatAt: { $exists: true, $ne: null, $lte: cutoff },
      })
        .select("_id status user telnyxCallControlId telnyxCallSessionId lastProcessedEventAt")
        .limit(80)
        .lean();

      for (const v of victims) {
        const eventAt = new Date();
        const result = await applyCallTransition({
          callId: v._id,
          eventAt,
          source: "heartbeat_monitor",
          eventType: "heartbeat_timeout",
          targetStatus: CALL_STATES.FAILED,
          guard: { currentStatus: v.status },
          set: {
            hangupCause: "server_heartbeat_timeout",
            failReason: "server_heartbeat_timeout",
            callEndedAt: new Date(),
          },
          reason: "server_heartbeat_timeout",
        });
        if (result.ok) {
          telecomStructuredLog("[CLEANUP FLOW]", {
            callId: String(v._id),
            userId: v.user ? String(v.user) : null,
            callControlId: v.telnyxCallControlId || null,
            currentStatus: v.status || null,
            eventType: "heartbeat_timeout",
            sourcePath: "callHeartbeatMonitor.js:startCallHeartbeatMonitor",
            hangupCause: "server_heartbeat_timeout",
          });
        }
      }
    } catch (e) {
      console.warn("[callHeartbeatMonitor]", e?.message || e);
    }
  }, TICK_MS);

  if (typeof timer.unref === "function") timer.unref();
}
