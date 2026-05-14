import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import { computeTelecomPressure, getPressureSnapshot } from "../../services/telecomBackpressureService.js";
import { getWebhookBurstStats } from "../../services/webhookBurstProtectionService.js";
import { getSocketThrottleStats } from "../../services/socketThrottleService.js";
import { getTelemetryBufferStats } from "../../services/telemetryBufferService.js";
import { getTelecomSchedulerStats } from "../../services/telecomPriorityScheduler.js";
import { computeUserLoadProfile, getUserThrottleHistory } from "../../services/hotUserIsolationService.js";

const router = express.Router();

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
}

/**
 * GET /api/admin/analytics/pressure
 */
router.get("/pressure", requireAdmin, async (_req, res) => {
  try {
    const [pressure, bursts] = await Promise.all([computeTelecomPressure(), Promise.resolve(getWebhookBurstStats())]);
    const snap = getPressureSnapshot();
    res.json({
      success: true,
      current: pressure,
      snapshotSync: snap,
      hotUsers: pressure.hotUsers,
      overloadedServices: {
        mongoPingMs: pressure.hints?.mongoPingMs ?? null,
        redisPingMs: pressure.hints?.redisPingMs ?? null,
      },
      queuePressure: {
        scheduler: getTelecomSchedulerStats(),
        schedulerDepthHint: pressure.hints?.queueDepthHint ?? null,
      },
      eventThroughput: {
        webhooksPer60s: pressure.hints?.webhooksPer60s,
        transitionsPer60s: pressure.hints?.transitionsPer60s,
        socketEmitsPer60s: pressure.hints?.socketEmitsPer60s,
      },
      droppedTelemetry: getTelemetryBufferStats(),
      socketThrottle: getSocketThrottleStats(),
      deferredTasks: getTelecomSchedulerStats().deferredTasks,
      burstDetections: bursts,
    });
  } catch (error) {
    console.error("[adminPressureForensics] pressure", error?.message || error);
    res.status(500).json({ success: false, error: "pressure_forensics_failed" });
  }
});

/**
 * GET /api/admin/analytics/pressure/user/:userId
 */
router.get("/pressure/user/:userId", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) return res.status(400).json({ success: false, error: "invalid_user_id" });
    const profile = await computeUserLoadProfile(uid);
    const bursts = getWebhookBurstStats();
    const userKey = `u:${String(uid)}`;
    const burstSlice = bursts.topKeys.filter((x) => x.key === userKey);
    res.json({
      success: true,
      loadProfile: profile,
      throttleHistory: getUserThrottleHistory(uid),
      burstSlice,
      concurrentCallPeakProxy: profile.ok ? profile.activeConcurrent : null,
    });
  } catch (error) {
    console.error("[adminPressureForensics] user", error?.message || error);
    res.status(500).json({ success: false, error: "user_pressure_failed" });
  }
});

export default router;
