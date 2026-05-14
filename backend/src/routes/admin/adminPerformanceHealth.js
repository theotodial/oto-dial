import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import {
  getLatestPerformanceHealthFromDb,
  getPerformanceTelemetryQuickSnapshot,
  getPerformanceTelemetryRing,
} from "../../services/performanceTelemetryService.js";

const router = express.Router();

/**
 * GET /api/admin/analytics/performance-health
 */
router.get("/performance-health", requireAdmin, async (_req, res) => {
  try {
    const latest = await getLatestPerformanceHealthFromDb();
    res.json({
      success: true,
      latest,
      quick: getPerformanceTelemetryQuickSnapshot(),
      ring: getPerformanceTelemetryRing().slice(-40),
    });
  } catch (error) {
    console.error("[adminPerformanceHealth]", error?.message || error);
    res.status(500).json({ success: false, error: "performance_health_failed" });
  }
});

export default router;
