import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Subscription from "../../models/Subscription.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import User from "../../models/User.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import {
  syncPaidInvoicesFromStripe,
  getStripeRevenueSummaryFromMongo
} from "../../services/stripeInvoiceSyncService.js";

const router = express.Router();

/**
 * Helper: Calculate date range from time filter
 */
function getDateRange(filter) {
  const now = new Date();
  let startDate = null;

  switch (filter) {
    case "7d":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "60d":
      startDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "all":
    default:
      startDate = null; // All time
  }

  return { startDate, endDate: now };
}

/**
 * GET /api/admin/analytics
 * Comprehensive analytics dashboard with time filters
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { filter = "30d" } = req.query;
    const { startDate, endDate } = getDateRange(filter);

    // Build date filter for MongoDB queries
    const dateFilter = startDate ? { createdAt: { $gte: startDate, $lte: endDate } } : {};

    // ================================
    // FINANCIAL METRICS
    // ================================
    let totalRevenue = 0;
    let totalTelnyxCost = 0;
    let stripeSync = { skipped: true, synced: 0, scanned: 0, pages: 0 };

    try {
      stripeSync = await syncPaidInvoicesFromStripe({
        startDate: startDate || undefined,
        endDate,
        maxPages: 6
      });
    } catch (syncErr) {
      console.warn("Stripe invoice sync warning:", syncErr.message);
    }

    try {
      const revenueSummary = await getStripeRevenueSummaryFromMongo({
        startDate: startDate || undefined,
        endDate
      });
      totalRevenue = revenueSummary.grossRevenue;
    } catch (summaryErr) {
      console.warn("Stripe revenue summary warning:", summaryErr.message);
    }

    // Telnyx cost fallback from call/sms/number records.
    const [calls, smsList, activeNumbers] = await Promise.all([
      Call.find(dateFilter).lean(),
      SMS.find(dateFilter).lean(),
      PhoneNumber.find({ status: "active" }).lean()
    ]);

    const callCost = calls.reduce((sum, call) => sum + Number(call.cost || 0), 0);
    const smsCost = smsList.reduce((sum, sms) => sum + Number(sms.cost || 0) + Number(sms.carrierFees || 0), 0);
    const monthlyNumberCost = activeNumbers.reduce((sum, num) => sum + Number(num.monthlyCost || 0), 0);
    const oneTimeNumberCost = activeNumbers.reduce((sum, num) => sum + Number(num.oneTimeFees || 0), 0);
    const daySpan = startDate
      ? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
      : 30;
    const numberCostForPeriod = (monthlyNumberCost / 30) * daySpan + oneTimeNumberCost;

    totalTelnyxCost = callCost + smsCost + numberCostForPeriod;

    const netProfit = totalRevenue - totalTelnyxCost;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // ================================
    // SUBSCRIPTION METRICS
    // ================================
    const subscriptions = await Subscription.find();
    const activeSubscriptions = subscriptions.filter(s => s.status === "active").length;
    const suspendedSubscriptions = subscriptions.filter(s => s.status === "suspended").length;
    const cancelledSubscriptions = subscriptions.filter(s => s.status === "cancelled").length;

    // Filter by date if needed
    let filteredSubscriptions = subscriptions;
    if (startDate) {
      filteredSubscriptions = subscriptions.filter(s => 
        new Date(s.createdAt) >= startDate
      );
    }

    // ================================
    // VOICE METRICS
    // ================================
    const allCalls = calls;
    const outboundCalls = allCalls.filter(c => c.direction === "outbound");
    const inboundCalls = allCalls.filter(c => c.direction === "inbound");
    const failedCalls = allCalls.filter(c => 
      c.status === "failed" || c.status === "missed"
    );

    // Calculate total call minutes (including ring time)
    let totalCallMinutes = 0;
    allCalls.forEach(call => {
      if (call.billedMinutes) {
        totalCallMinutes += call.billedMinutes;
      } else if (call.durationSeconds) {
        totalCallMinutes += call.durationSeconds / 60;
      }
    });

    // ================================
    // MESSAGING METRICS
    // ================================
    const allSms = smsList;
    const sentSms = allSms.filter(s => s.direction === "outbound");
    const receivedSms = allSms.filter(s => s.direction === "inbound");
    const failedSms = allSms.filter(s => s.status === "failed");

    res.json({
      success: true,
      filter,
      period: {
        startDate: startDate?.toISOString() || null,
        endDate: endDate.toISOString()
      },
      financial: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalTelnyxCost: parseFloat(totalTelnyxCost.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        profitMargin: parseFloat(profitMargin.toFixed(2))
      },
      stripeSync,
      subscriptions: {
        total: subscriptions.length,
        active: activeSubscriptions,
        suspended: suspendedSubscriptions,
        cancelled: cancelledSubscriptions,
        newInPeriod: filteredSubscriptions.length
      },
      voice: {
        totalOutboundCalls: outboundCalls.length,
        totalInboundCalls: inboundCalls.length,
        totalCallMinutes: parseFloat(totalCallMinutes.toFixed(2)),
        failedCalls: failedCalls.length
      },
      messaging: {
        totalSmsSent: sentSms.length,
        totalSmsReceived: receivedSms.length,
        failedSms: failedSms.length
      }
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch analytics"
    });
  }
});

export default router;
