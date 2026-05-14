import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import TelecomChaosSnapshot from "../../models/TelecomChaosSnapshot.js";
import { listWorkerHeartbeats } from "../../services/workerHeartbeatService.js";
import { verifyReplayDeterminismForCall } from "../../services/replayDeterminismVerifier.js";
import { detectSplitBrainBillingSignals } from "../../services/splitBrainBillingDetector.js";
import { measureWorkerClockDrift } from "../../services/clockDriftService.js";
import { validateTelecomEventOrderingForCall } from "../../services/eventOrderValidationService.js";

const router = express.Router();

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
}

router.get("/chaos/recent", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const rows = await TelecomChaosSnapshot.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, snapshots: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "chaos_recent_failed" });
  }
});

router.get("/chaos/call/:callId", requireAdmin, async (req, res) => {
  try {
    const cid = toObjectId(req.params.callId);
    if (!cid) return res.status(400).json({ success: false, error: "invalid_call_id" });
    const rows = await TelecomChaosSnapshot.find({ callId: cid }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, callId: String(cid), snapshots: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "chaos_call_failed" });
  }
});

router.get("/chaos/worker-health", requireAdmin, async (_req, res) => {
  try {
    const hb = await listWorkerHeartbeats();
    res.json({ success: true, ...hb });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "worker_health_failed" });
  }
});

router.get("/chaos/replay/:callId", requireAdmin, async (req, res) => {
  try {
    const cid = toObjectId(req.params.callId);
    if (!cid) return res.status(400).json({ success: false, error: "invalid_call_id" });
    const r = await verifyReplayDeterminismForCall(cid, {});
    res.json({ success: true, result: r });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "replay_failed" });
  }
});

router.get("/chaos/split-brain", requireAdmin, async (_req, res) => {
  try {
    const r = await detectSplitBrainBillingSignals({});
    res.json({ success: true, ...r });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "split_brain_failed" });
  }
});

router.get("/chaos/clock-drift", requireAdmin, async (_req, res) => {
  try {
    const r = await measureWorkerClockDrift({ limit: 120 });
    res.json({ success: true, ...r });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "clock_drift_failed" });
  }
});

router.get("/chaos/event-order/:callId", requireAdmin, async (req, res) => {
  try {
    const cid = toObjectId(req.params.callId);
    if (!cid) return res.status(400).json({ success: false, error: "invalid_call_id" });
    const r = await validateTelecomEventOrderingForCall(cid, {});
    res.json({ success: true, ...r });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "event_order_failed" });
  }
});

export default router;
