import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import {
  resolveTimeframe,
  TIMEFRAME_PRESETS,
  DEFAULT_TIMEFRAME,
} from "../../services/analytics/timeframeService.js";
import {
  buildStripeAdminReport,
  buildStripeAllPaymentsReport,
  createStripeRefund,
  closeStripeDispute,
  cancelStripePaymentIntent,
  detachCustomerPaymentMethods,
} from "../../services/stripeAdminReportService.js";
import { buildStripePaidUsersReport } from "../../services/stripePaidUsersReportService.js";

const router = express.Router();

function resolveWindowParam(window) {
  const key = String(window || DEFAULT_TIMEFRAME).trim();
  return TIMEFRAME_PRESETS.has(key) ? key : DEFAULT_TIMEFRAME;
}

function resolveRequestTimeframe(query = {}) {
  const windowKey = resolveWindowParam(query.window);
  const timeframe = resolveTimeframe({
    window: windowKey,
    startDate: query.startDate || null,
    endDate: query.endDate || null,
  });
  return { windowKey, timeframe };
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { timeframe } = resolveRequestTimeframe(req.query);
    const report = await buildStripeAdminReport({
      start: timeframe.start,
      end: timeframe.end,
      syncInvoices: req.query.syncInvoices === "1",
    });

    res.json({
      success: true,
      timeframe: {
        window: timeframe.window,
        label: timeframe.label,
        start: timeframe.start.toISOString(),
        end: timeframe.end.toISOString(),
      },
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin Stripe report error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to fetch Stripe report" });
  }
});

router.get("/payments", requireAdmin, async (req, res) => {
  try {
    const report = await buildStripeAllPaymentsReport();
    if (!report.available) {
      return res.status(503).json({ success: false, error: report.error || "Stripe not configured" });
    }
    res.json({
      success: true,
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin Stripe payments error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to fetch Stripe payments" });
  }
});

router.get("/paid-users", requireAdmin, async (req, res) => {
  try {
    const report = await buildStripePaidUsersReport({
      syncFromStripe: req.query.sync === "1",
    });
    if (!report.available) {
      return res.status(report.error?.includes("MongoDB") ? 503 : 503).json({
        success: false,
        error: report.error || "Failed to build paid users report",
      });
    }
    res.json({
      success: true,
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin Stripe paid-users error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to fetch paid users" });
  }
});

router.post("/sync", requireAdmin, async (req, res) => {
  try {
    const { timeframe } = resolveRequestTimeframe(req.query);
    const report = await buildStripeAdminReport({
      start: timeframe.start,
      end: timeframe.end,
      syncInvoices: true,
    });

    res.json({
      success: true,
      timeframe: {
        window: timeframe.window,
        label: timeframe.label,
        start: timeframe.start.toISOString(),
        end: timeframe.end.toISOString(),
      },
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin Stripe sync error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to sync Stripe data" });
  }
});

router.post("/refund", requireAdmin, async (req, res) => {
  try {
    const { chargeId, paymentIntentId, amountUsd, reason } = req.body || {};
    if (!chargeId && !paymentIntentId) {
      return res.status(400).json({ success: false, error: "chargeId or paymentIntentId required" });
    }
    const refund = await createStripeRefund({ chargeId, paymentIntentId, amountUsd, reason });
    res.json({ success: true, refund });
  } catch (err) {
    console.error("Stripe refund error:", err);
    res.status(500).json({ success: false, error: err.message || "Refund failed" });
  }
});

router.post("/disputes/:id/close", requireAdmin, async (req, res) => {
  try {
    const dispute = await closeStripeDispute(req.params.id);
    res.json({ success: true, dispute });
  } catch (err) {
    console.error("Stripe dispute close error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to close dispute" });
  }
});

router.post("/payment-intents/:id/cancel", requireAdmin, async (req, res) => {
  try {
    const paymentIntent = await cancelStripePaymentIntent(req.params.id);
    res.json({ success: true, paymentIntent });
  } catch (err) {
    console.error("Stripe PI cancel error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to cancel payment intent" });
  }
});

router.post("/customers/:id/block-payments", requireAdmin, async (req, res) => {
  try {
    const result = await detachCustomerPaymentMethods(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Stripe block payments error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to block customer payments" });
  }
});

export default router;
