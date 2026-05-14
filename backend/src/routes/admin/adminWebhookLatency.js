import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import { aggregateWebhookLatencyFromDb, getWebhookLatencyRingSnapshot } from "../../services/webhookLatencyService.js";

const router = express.Router();

/**
 * GET /api/admin/analytics/webhook-latency
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const sinceMs = Math.min(7 * 24 * 3600 * 1000, Math.max(60_000, Number(req.query.sinceMs) || 3600000));
    const agg = await aggregateWebhookLatencyFromDb(sinceMs);
    res.json({
      success: true,
      sinceMs,
      ...agg,
      ringRecent: getWebhookLatencyRingSnapshot(80),
    });
  } catch (err) {
    console.error("[admin webhook-latency]", err);
    res.status(500).json({ success: false, error: err.message || "failed" });
  }
});

export default router;
