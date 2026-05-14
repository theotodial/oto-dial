import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import ProcessedWebhookEvent from "../../models/ProcessedWebhookEvent.js";
import { computeCanonicalCallSnapshot } from "../../services/callConvergenceService.js";
import { listTelecomSequenceForCall } from "../../services/telecomSequenceService.js";
import { aggregateWebhookLatencyFromDb, getWebhookLatencyRingSnapshot } from "../../services/webhookLatencyService.js";

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
 * GET /api/admin/analytics/telecom-forensics/call/:callId
 */
router.get("/call/:callId", requireAdmin, async (req, res) => {
  try {
    const cid = toObjectId(req.params.callId);
    if (!cid) return res.status(400).json({ success: false, error: "invalid_call_id" });
    const [convergence, sequence, call] = await Promise.all([
      computeCanonicalCallSnapshot(cid),
      listTelecomSequenceForCall(cid, 300),
      Call.findById(cid).lean(),
    ]);
    const dupRatio = await ProcessedWebhookEvent.countDocuments({
      processedAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) },
      duplicateCount: { $gt: 0 },
    }).catch(() => 0);
    res.json({
      success: true,
      callId: String(cid),
      convergence: convergence.snapshot,
      telecomSequence: sequence,
      webhookLatencyRing: getWebhookLatencyRingSnapshot(40),
      duplicateWebhookCount24h: dupRatio,
      rawCall: call
        ? {
            status: call.status,
            telnyxCallControlId: call.telnyxCallControlId,
            updatedAt: call.updatedAt,
          }
        : null,
    });
  } catch (err) {
    console.error("[telecomForensics] call", err);
    res.status(500).json({ success: false, error: err.message || "forensics_failed" });
  }
});

/**
 * GET /api/admin/analytics/telecom-forensics/user/:userId
 */
router.get("/user/:userId", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) return res.status(400).json({ success: false, error: "invalid_user_id" });
    const active = await Call.find({
      user: uid,
      status: { $in: ["queued", "initiated", "dialing", "ringing", "answered", "in-progress"] },
    })
      .select("_id status direction updatedAt telnyxCallControlId")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    const recentDups = await ProcessedWebhookEvent.find({ duplicateCount: { $gt: 0 } })
      .sort({ lastDuplicateAt: -1 })
      .limit(30)
      .lean()
      .catch(() => []);
    res.json({
      success: true,
      userId: String(uid),
      activeSessions: active,
      staleSocketsNote: "presence_not_tracked; use activeSessions vs terminal reconciliation",
      recentDuplicateWebhooks: recentDups,
      webhookLatencySummary: await aggregateWebhookLatencyFromDb(24 * 3600 * 1000),
    });
  } catch (err) {
    console.error("[telecomForensics] user", err);
    res.status(500).json({ success: false, error: err.message || "forensics_failed" });
  }
});

export default router;
