import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Subscription from "../../models/Subscription.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import User from "../../models/User.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Stripe from "stripe";

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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

    // Calculate Stripe revenue
    if (stripe) {
      try {
        // Get all paid invoices (paginate if needed)
        let hasMore = true;
        let startingAfter = null;
        
        while (hasMore) {
          const params = {
            limit: 100,
            status: "paid"
          };
          if (startingAfter) params.starting_after = startingAfter;
          
          const invoices = await stripe.invoices.list(params);
          
          invoices.data.forEach(invoice => {
            const invoiceDate = new Date(invoice.created * 1000);
            if (!startDate || invoiceDate >= startDate) {
              totalRevenue += invoice.amount_paid / 100; // Convert cents to dollars
            }
          });
          
          hasMore = invoices.has_more;
          if (hasMore && invoices.data.length > 0) {
            startingAfter = invoices.data[invoices.data.length - 1].id;
          } else {
            hasMore = false;
          }
        }
      } catch (stripeErr) {
        console.warn("Stripe revenue calculation error:", stripeErr.message);
      }
    }

    // Calculate Telnyx costs (from call costs)
    const calls = await Call.find(dateFilter);
    calls.forEach(call => {
      if (call.cost) {
        totalTelnyxCost += call.cost;
      }
    });

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
    const allCalls = await Call.find(dateFilter);
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
    const allSms = await SMS.find(dateFilter);
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
