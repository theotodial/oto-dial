import Call from "../models/Call.js";

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
        .select("_id status user")
        .limit(80)
        .lean();

      for (const v of victims) {
        const res = await Call.updateOne(
          {
            _id: v._id,
            status: v.status,
            lastHeartbeatAt: { $lte: cutoff },
          },
          {
            $set: {
              status: "failed",
              hangupCause: "server_heartbeat_timeout",
              failReason: "server_heartbeat_timeout",
              callEndedAt: new Date(),
            },
          }
        );
        if (res.modifiedCount) {
          console.log("[CALL FLOW]", {
            userId: v.user ? String(v.user) : null,
            state: "timeout",
            callControlId: null,
            detail: "server_heartbeat_timeout",
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.warn("[callHeartbeatMonitor]", e?.message || e);
    }
  }, TICK_MS);

  if (typeof timer.unref === "function") timer.unref();
}
