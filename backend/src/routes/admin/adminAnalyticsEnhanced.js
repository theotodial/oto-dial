import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Subscription from "../../models/Subscription.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import User from "../../models/User.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import TelnyxCost from "../../models/TelnyxCost.js";
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
 * GET /api/admin/analytics/enhanced
 * Enterprise-grade analytics with FULL cost breakdown
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { filter = "30d" } = req.query;
    const { startDate, endDate } = getDateRange(filter);
    const dateFilter = startDate ? { createdAt: { $gte: startDate, $lte: endDate } } : {};

    // ================================
    // 1. TELNYX COSTS - FROM IMMUTABLE LEDGER
    // All costs come from TelnyxCost collection (admin-defined pricing)
    // ================================
    
    // Build event timestamp filter for TelnyxCost
    const costDateFilter = startDate 
      ? { eventTimestamp: { $gte: startDate, $lte: endDate } }
      : {};

    // CALL COSTS - Aggregate from TelnyxCost ledger
    const callCosts = await TelnyxCost.aggregate([
      {
        $match: {
          resourceType: "call",
          ...costDateFilter
        }
      },
      {
        $group: {
          _id: "$direction",
          totalCost: { $sum: "$totalCostUsd" },
          totalSeconds: { $sum: "$billedSeconds" },
          totalRingingSeconds: { $sum: "$ringingSeconds" },
          totalAnsweredSeconds: { $sum: "$answeredSeconds" },
          count: { $sum: 1 }
        }
      }
    ]);

    let telnyxCallCost = 0;
    let telnyxCallCostInbound = 0;
    let telnyxCallCostOutbound = 0;
    let totalRingingSeconds = 0;
    let totalAnsweredSeconds = 0;
    let totalBilledSeconds = 0;
    let totalCallMinutes = 0;
    let avgCostPerSecond = 0;
    let avgCostPerMinute = 0;
    let pendingCallCosts = 0;

    callCosts.forEach(cost => {
      telnyxCallCost += cost.totalCost;
      totalBilledSeconds += cost.totalSeconds;
      totalRingingSeconds += cost.totalRingingSeconds;
      totalAnsweredSeconds += cost.totalAnsweredSeconds;
      
      if (cost._id === "inbound") {
        telnyxCallCostInbound += cost.totalCost;
      } else if (cost._id === "outbound") {
        telnyxCallCostOutbound += cost.totalCost;
      }
    });

    // Calculate pending costs (calls without cost records)
    const callsWithCosts = await TelnyxCost.distinct("resourceId", {
      resourceType: "call",
      ...costDateFilter
    });
    const allCalls = await Call.find(dateFilter);
    pendingCallCosts = allCalls.filter(c => !callsWithCosts.includes(c._id.toString())).length;

    totalCallMinutes = totalBilledSeconds / 60;
    if (totalBilledSeconds > 0) {
      avgCostPerSecond = telnyxCallCost / totalBilledSeconds;
      avgCostPerMinute = avgCostPerSecond * 60;
    }

    // Calculate ringing and answered costs
    const ringingSecondsCost = callCosts.reduce((sum, c) => 
      sum + (c.totalRingingSeconds * (c.totalCost / (c.totalSeconds || 1))), 0
    );
    const answeredSecondsCost = callCosts.reduce((sum, c) => 
      sum + (c.totalAnsweredSeconds * (c.totalCost / (c.totalSeconds || 1))), 0
    );

    // SMS COSTS - Aggregate from TelnyxCost ledger
    const smsCosts = await TelnyxCost.aggregate([
      {
        $match: {
          resourceType: "sms",
          ...costDateFilter
        }
      },
      {
        $group: {
          _id: "$direction",
          totalCost: { $sum: "$totalCostUsd" },
          count: { $sum: 1 }
        }
      }
    ]);

    let telnyxSmsCost = 0;
    let telnyxSmsCostInbound = 0;
    let telnyxSmsCostOutbound = 0;
    let totalSmsCarrierFees = 0;
    let avgCostPerSms = 0;
    let pendingSmsCosts = 0;

    smsCosts.forEach(cost => {
      telnyxSmsCost += cost.totalCost;
      if (cost._id === "inbound") {
        telnyxSmsCostInbound += cost.totalCost;
      } else if (cost._id === "outbound") {
        telnyxSmsCostOutbound += cost.totalCost;
      }
    });

    // Calculate pending costs (SMS without cost records)
    const smsWithCosts = await TelnyxCost.distinct("resourceId", {
      resourceType: "sms",
      ...costDateFilter
    });
    const allSms = await SMS.find(dateFilter);
    pendingSmsCosts = allSms.filter(s => !smsWithCosts.includes(s._id.toString())).length;

    const totalSmsCount = smsCosts.reduce((sum, c) => sum + c.count, 0);
    if (totalSmsCount > 0) {
      avgCostPerSms = telnyxSmsCost / totalSmsCount;
    }

    // PHONE NUMBER COSTS - Aggregate from TelnyxCost ledger
    const numberCosts = await TelnyxCost.aggregate([
      {
        $match: {
          resourceType: "number",
          ...costDateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalCost: { $sum: "$totalCostUsd" },
          count: { $sum: 1 }
        }
      }
    ]);

    let totalNumberCost = numberCosts.length > 0 ? numberCosts[0].totalCost : 0;
    const allNumbers = await PhoneNumber.find({ status: "active" });
    const activeNumbersCount = allNumbers.length;

    // Calculate monthly equivalent (for display)
    const daysInPeriod = startDate ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) : 365;
    const monthlyCostForPeriod = totalNumberCost; // Already accrued daily
    const totalNumberMonthlyCost = (totalNumberCost * 30) / daysInPeriod; // Estimate monthly
    const totalNumberOneTimeCost = 0; // One-time costs handled separately if needed
    const totalNumberExtraFees = 0;

    const totalTelnyxCost = telnyxCallCost + telnyxSmsCost + totalNumberCost;

    // ================================
    // 2. STRIPE COSTS - FULL BREAKDOWN
    // ================================
    let grossRevenue = 0;
    let stripeProcessingFees = 0;
    let refunds = 0;
    let netRevenue = 0;

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
            if (!startDate || (invoiceDate >= startDate && invoiceDate <= endDate)) {
              const amount = invoice.amount_paid / 100;
              grossRevenue += amount;
              
              // Calculate Stripe fee (2.9% + $0.30 per transaction, approximate)
              const stripeFee = (amount * 0.029) + 0.30;
              stripeProcessingFees += stripeFee;
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
          if (!startDate || (refundDate >= startDate && refundDate <= endDate)) {
            refunds += refund.amount / 100;
          }
        });
      } catch (stripeErr) {
        console.warn("Stripe calculation error:", stripeErr.message);
      }
    }

    netRevenue = grossRevenue - stripeProcessingFees - refunds;

    // ================================
    // 3. PROFIT CALCULATION
    // ================================
    const netProfit = netRevenue - totalTelnyxCost;
    const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    // ================================
    // 4. PER-USER METRICS
    // ================================
    const users = await User.find();
    const subscriptions = await Subscription.find();
    const activeSubscriptions = subscriptions.filter(s => s.status === "active");
    
    let avgCostPerUser = 0;
    let avgRevenuePerUser = 0;
    if (activeSubscriptions.length > 0) {
      avgCostPerUser = totalTelnyxCost / activeSubscriptions.length;
      avgRevenuePerUser = netRevenue / activeSubscriptions.length;
    }

    // ================================
    // 5. USAGE METRICS
    // ================================
    const outboundCalls = allCalls.filter(c => c.direction === "outbound");
    const inboundCalls = allCalls.filter(c => c.direction === "inbound");
    const failedCalls = allCalls.filter(c => c.status === "failed" || c.status === "missed");
    
    const sentSms = allSms.filter(s => s.direction === "outbound");
    const receivedSms = allSms.filter(s => s.direction === "inbound");
    const failedSms = allSms.filter(s => s.status === "failed");

    res.json({
      success: true,
      filter,
      period: {
        startDate: startDate?.toISOString() || null,
        endDate: endDate.toISOString(),
        days: daysInPeriod
      },
      financial: {
        // Stripe
        grossRevenue: parseFloat(grossRevenue.toFixed(2)),
        stripeProcessingFees: parseFloat(stripeProcessingFees.toFixed(2)),
        refunds: parseFloat(refunds.toFixed(2)),
        netRevenue: parseFloat(netRevenue.toFixed(2)),
        // Telnyx
        telnyxCallCost: parseFloat(telnyxCallCost.toFixed(4)),
        telnyxSmsCost: parseFloat(telnyxSmsCost.toFixed(4)),
        telnyxNumberCost: parseFloat(totalNumberCost.toFixed(4)),
        totalTelnyxCost: parseFloat(totalTelnyxCost.toFixed(4)),
        // Profit
        netProfit: parseFloat(netProfit.toFixed(2)),
        profitMargin: parseFloat(profitMargin.toFixed(2))
      },
      telnyxBreakdown: {
        calls: {
          totalCost: parseFloat(telnyxCallCost.toFixed(4)),
          inboundCost: parseFloat(telnyxCallCostInbound.toFixed(4)),
          outboundCost: parseFloat(telnyxCallCostOutbound.toFixed(4)),
          ringingSecondsCost: parseFloat(ringingSecondsCost.toFixed(4)),
          answeredSecondsCost: parseFloat(answeredSecondsCost.toFixed(4)),
          totalRingingSeconds,
          totalAnsweredSeconds,
          totalBilledSeconds,
          totalCallMinutes: parseFloat(totalCallMinutes.toFixed(2)),
          avgCostPerSecond: parseFloat(avgCostPerSecond.toFixed(6)),
          avgCostPerMinute: parseFloat(avgCostPerMinute.toFixed(4)),
          pendingCosts: pendingCallCosts
        },
        sms: {
          totalCost: parseFloat(telnyxSmsCost.toFixed(4)),
          inboundCost: parseFloat(telnyxSmsCostInbound.toFixed(4)),
          outboundCost: parseFloat(telnyxSmsCostOutbound.toFixed(4)),
          carrierFees: parseFloat(totalSmsCarrierFees.toFixed(4)),
          avgCostPerSms: parseFloat(avgCostPerSms.toFixed(4)),
          pendingCosts: pendingSmsCosts
        },
        numbers: {
          activeCount: activeNumbersCount,
          monthlyCost: parseFloat(totalNumberMonthlyCost.toFixed(2)),
          monthlyCostForPeriod: parseFloat(totalNumberCost.toFixed(4)),
          oneTimeCost: parseFloat(totalNumberOneTimeCost.toFixed(2)),
          extraFees: parseFloat(totalNumberExtraFees.toFixed(2)),
          totalCost: parseFloat(totalNumberCost.toFixed(4))
        }
      },
      subscriptions: {
        total: subscriptions.length,
        active: activeSubscriptions.length,
        suspended: subscriptions.filter(s => s.status === "suspended").length,
        cancelled: subscriptions.filter(s => s.status === "cancelled").length
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
      },
      averages: {
        costPerUser: parseFloat(avgCostPerUser.toFixed(2)),
        revenuePerUser: parseFloat(avgRevenuePerUser.toFixed(2)),
        costPerMinute: parseFloat(avgCostPerMinute.toFixed(4)),
        costPerSms: parseFloat(avgCostPerSms.toFixed(4))
      }
    });
  } catch (err) {
    console.error("Enhanced analytics error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch enhanced analytics"
    });
  }
});

export default router;
