import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import { getLiveBillingHealthSnapshot } from "../../services/liveBillingHealthService.js";
import { runProductionReadinessChecks } from "../../services/productionReadinessService.js";

const router = express.Router();

/**
 * GET /api/admin/analytics/live-billing-health
 */
router.get("/live-billing-health", requireAdmin, async (_req, res) => {
  try {
    const [live, readiness] = await Promise.all([
      getLiveBillingHealthSnapshot(),
      runProductionReadinessChecks({ fullIndexAudit: false, silent: true }),
    ]);
    res.json({
      ...live,
      systemReadiness: readiness,
    });
  } catch (e) {
    console.error("[adminLiveBillingHealth]", e?.message || e);
    res.status(500).json({ success: false, error: e?.message || "live_billing_health_failed" });
  }
});

export default router;
