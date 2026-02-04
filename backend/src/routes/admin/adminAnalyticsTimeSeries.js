import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import Subscription from "../../models/Subscription.js";
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
      startDate = new Date(0); // All time
  }

  return { startDate, endDate: now };
}

/**
 * GET /api/admin/analytics/time-series
 * Get time-series data for charts
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { filter = "30d" } = req.query;
    const { startDate, endDate } = getDateRange(filter);

    // Group by day
    const days = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Financial time series
    const revenueByDay = new Map();
    const costByDay = new Map();

    // Get Stripe revenue by day
    if (stripe) {
      try {
        let hasMore = true;
        let startingAfter = null;
        
        while (hasMore) {
          const params = { limit: 100, status: "paid" };
          if (startingAfter) params.starting_after = startingAfter;
          
          const invoices = await stripe.invoices.list(params);
          
          invoices.data.forEach(invoice => {
            const invoiceDate = new Date(invoice.created * 1000);
            if (invoiceDate >= startDate && invoiceDate <= endDate) {
              const dayKey = invoiceDate.toISOString().split('T')[0];
              const current = revenueByDay.get(dayKey) || 0;
              revenueByDay.set(dayKey, current + (invoice.amount_paid / 100));
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
        console.warn("Stripe time series error:", stripeErr.message);
      }
    }

    // Get Telnyx costs by day (from calls)
    const calls = await Call.find({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    calls.forEach(call => {
      if (call.cost && call.createdAt) {
        const dayKey = call.createdAt.toISOString().split('T')[0];
        const current = costByDay.get(dayKey) || 0;
        costByDay.set(dayKey, current + call.cost);
      }
    });

    // Calls by day
    const callsByDay = await Call.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 },
          outbound: {
            $sum: { $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0] }
          },
          inbound: {
            $sum: { $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0] }
          },
          failed: {
            $sum: {
              $cond: [
                { $in: ["$status", ["failed", "missed"]] },
                1,
                0
              ]
            }
          },
          minutes: { $sum: "$billedMinutes" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // SMS by day
    const smsByDay = await SMS.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          sent: {
            $sum: { $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0] }
          },
          received: {
            $sum: { $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Build time series arrays
    const financialData = days.map(day => {
      const dayKey = day.toISOString().split('T')[0];
      return {
        date: dayKey,
        revenue: revenueByDay.get(dayKey) || 0,
        cost: costByDay.get(dayKey) || 0,
        profit: (revenueByDay.get(dayKey) || 0) - (costByDay.get(dayKey) || 0)
      };
    });

    const callsDataMap = new Map(callsByDay.map(item => [item._id, item]));
    const callsData = days.map(day => {
      const dayKey = day.toISOString().split('T')[0];
      const data = callsDataMap.get(dayKey) || {};
      return {
        date: dayKey,
        total: data.count || 0,
        outbound: data.outbound || 0,
        inbound: data.inbound || 0,
        failed: data.failed || 0,
        minutes: data.minutes || 0
      };
    });

    const smsDataMap = new Map(smsByDay.map(item => [item._id, item]));
    const smsData = days.map(day => {
      const dayKey = day.toISOString().split('T')[0];
      const data = smsDataMap.get(dayKey) || {};
      return {
        date: dayKey,
        sent: data.sent || 0,
        received: data.received || 0,
        failed: data.failed || 0
      };
    });

    res.json({
      success: true,
      filter,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      financial: financialData,
      calls: callsData,
      sms: smsData
    });
  } catch (err) {
    console.error("Time series analytics error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch time series data"
    });
  }
});

export default router;
