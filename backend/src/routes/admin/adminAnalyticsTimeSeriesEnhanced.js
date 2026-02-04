import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
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
 * GET /api/admin/analytics/time-series/enhanced
 * Enhanced time-series data with full cost breakdown for charts
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { filter = "30d" } = req.query;
    const { startDate, endDate } = getDateRange(filter);

    // Generate array of days
    const days = [];
    const currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);
    while (currentDate <= endDateObj) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Initialize daily data map
    const dailyDataMap = new Map();
    days.forEach(day => {
      const dayKey = day.toISOString().split('T')[0];
      dailyDataMap.set(dayKey, {
        date: dayKey,
        revenue: 0,
        stripeFees: 0,
        refunds: 0,
        netRevenue: 0,
        telnyxCallCost: 0,
        telnyxSmsCost: 0,
        telnyxNumberCost: 0,
        totalTelnyxCost: 0,
        profit: 0,
        calls: 0,
        callMinutes: 0,
        sms: 0,
        failedCalls: 0,
        failedSms: 0
      });
    });

    // Fetch and aggregate Calls
    const calls = await Call.find({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    calls.forEach(call => {
      const dayKey = new Date(call.createdAt).toISOString().split('T')[0];
      const dayData = dailyDataMap.get(dayKey);
      if (dayData) {
        dayData.calls += 1;
        if (call.cost) dayData.telnyxCallCost += call.cost;
        if (call.billedMinutes) {
          dayData.callMinutes += call.billedMinutes;
        } else if (call.durationSeconds) {
          dayData.callMinutes += call.durationSeconds / 60;
        }
        if (call.status === 'failed' || call.status === 'missed') {
          dayData.failedCalls += 1;
        }
      }
    });

    // Fetch and aggregate SMS
    const smsList = await SMS.find({
      createdAt: { $gte: startDate, $lte: endDate }
    });

    smsList.forEach(sms => {
      const dayKey = new Date(sms.createdAt).toISOString().split('T')[0];
      const dayData = dailyDataMap.get(dayKey);
      if (dayData) {
        dayData.sms += 1;
        if (sms.cost) dayData.telnyxSmsCost += sms.cost;
        if (sms.status === 'failed') {
          dayData.failedSms += 1;
        }
      }
    });

    // Calculate number costs (distributed daily)
    const activeNumbers = await PhoneNumber.find({ status: "active" });
    const totalMonthlyCost = activeNumbers.reduce((sum, num) => sum + (num.monthlyCost || 0), 0);
    const dailyNumberCost = totalMonthlyCost / 30; // Approximate daily cost

    days.forEach(day => {
      const dayKey = day.toISOString().split('T')[0];
      const dayData = dailyDataMap.get(dayKey);
      if (dayData) {
        dayData.telnyxNumberCost = dailyNumberCost;
      }
    });

    // Fetch Stripe revenue (if available)
    if (stripe) {
      try {
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
            if (invoiceDate >= startDate && invoiceDate <= endDate) {
              const dayKey = invoiceDate.toISOString().split('T')[0];
              const dayData = dailyDataMap.get(dayKey);
              if (dayData) {
                const amount = invoice.amount_paid / 100;
                dayData.revenue += amount;
                // Stripe fee: 2.9% + $0.30
                const stripeFee = (amount * 0.029) + 0.30;
                dayData.stripeFees += stripeFee;
              }
            }
          });
          
          hasMore = invoices.has_more;
          if (hasMore && invoices.data.length > 0) {
            startingAfter = invoices.data[invoices.data.length - 1].id;
          } else {
            hasMore = false;
          }
        }

        // Get refunds
        const refundList = await stripe.refunds.list({ limit: 100 });
        refundList.data.forEach(refund => {
          const refundDate = new Date(refund.created * 1000);
          if (refundDate >= startDate && refundDate <= endDate) {
            const dayKey = refundDate.toISOString().split('T')[0];
            const dayData = dailyDataMap.get(dayKey);
            if (dayData) {
              dayData.refunds += refund.amount / 100;
            }
          }
        });
      } catch (stripeErr) {
        console.warn("Stripe time-series error:", stripeErr.message);
      }
    }

    // Calculate totals and profit for each day
    const timeSeriesData = Array.from(dailyDataMap.values()).map(day => {
      day.netRevenue = day.revenue - day.stripeFees - day.refunds;
      day.totalTelnyxCost = day.telnyxCallCost + day.telnyxSmsCost + day.telnyxNumberCost;
      day.profit = day.netRevenue - day.totalTelnyxCost;
      return {
        ...day,
        revenue: parseFloat(day.revenue.toFixed(2)),
        stripeFees: parseFloat(day.stripeFees.toFixed(2)),
        refunds: parseFloat(day.refunds.toFixed(2)),
        netRevenue: parseFloat(day.netRevenue.toFixed(2)),
        telnyxCallCost: parseFloat(day.telnyxCallCost.toFixed(4)),
        telnyxSmsCost: parseFloat(day.telnyxSmsCost.toFixed(4)),
        telnyxNumberCost: parseFloat(day.telnyxNumberCost.toFixed(2)),
        totalTelnyxCost: parseFloat(day.totalTelnyxCost.toFixed(4)),
        profit: parseFloat(day.profit.toFixed(2)),
        callMinutes: parseFloat(day.callMinutes.toFixed(2))
      };
    });

    res.json({
      success: true,
      filter,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      data: timeSeriesData.sort((a, b) => a.date.localeCompare(b.date))
    });
  } catch (err) {
    console.error("Enhanced time-series analytics error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch enhanced time-series data"
    });
  }
});

export default router;
