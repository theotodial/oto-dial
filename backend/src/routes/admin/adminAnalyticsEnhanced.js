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

  // Handle custom date ranges
  if (filter.startsWith('range:')) {
    const parts = filter.split(':');
    if (parts.length === 3) {
      startDate = new Date(parts[1]);
      const endDate = new Date(parts[2]);
      return { startDate, endDate };
    }
  }

  // Handle custom hours/days (e.g., "5h", "10d")
  if (filter.endsWith('h')) {
    const hours = parseInt(filter.replace('h', ''));
    if (!isNaN(hours)) {
      startDate = new Date(now.getTime() - hours * 60 * 60 * 1000);
      return { startDate, endDate: now };
    }
  }
  if (filter.endsWith('d')) {
    const days = parseInt(filter.replace('d', ''));
    if (!isNaN(days)) {
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return { startDate, endDate: now };
    }
  }

  switch (filter) {
    case "1h":
      startDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      break;
    case "4h":
      startDate = new Date(now.getTime() - 4 * 60 * 60 * 1000);
      break;
    case "24h":
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "3d":
      startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      break;
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

    // FALLBACK: If TelnyxCost is empty, calculate from Call records directly
    if (telnyxCallCost === 0 && allCalls.length > 0) {
      const callCostsFromRecords = allCalls.reduce((acc, call) => {
        const callCost = call.cost || 0;
        const billedSecs = call.billedSeconds || call.duration || 0;
        const ringingSecs = call.ringingDuration || 0;
        const answeredSecs = call.answeredDuration || (billedSecs - ringingSecs);
        
        acc.totalCost += callCost;
        acc.totalBilledSeconds += billedSecs;
        acc.totalRingingSeconds += ringingSecs;
        acc.totalAnsweredSeconds += answeredSecs;
        
        if (call.direction === "inbound") {
          acc.inboundCost += callCost;
        } else if (call.direction === "outbound") {
          acc.outboundCost += callCost;
        }
        
        return acc;
      }, { totalCost: 0, inboundCost: 0, outboundCost: 0, totalBilledSeconds: 0, totalRingingSeconds: 0, totalAnsweredSeconds: 0 });
      
      telnyxCallCost = callCostsFromRecords.totalCost;
      telnyxCallCostInbound = callCostsFromRecords.inboundCost;
      telnyxCallCostOutbound = callCostsFromRecords.outboundCost;
      totalBilledSeconds = callCostsFromRecords.totalBilledSeconds;
      totalRingingSeconds = callCostsFromRecords.totalRingingSeconds;
      totalAnsweredSeconds = callCostsFromRecords.totalAnsweredSeconds;
      
      totalCallMinutes = totalBilledSeconds / 60;
      if (totalBilledSeconds > 0) {
        avgCostPerSecond = telnyxCallCost / totalBilledSeconds;
        avgCostPerMinute = avgCostPerSecond * 60;
      }
    }

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

    // FALLBACK: If TelnyxCost is empty, calculate from SMS records directly
    // Default SMS pricing: Outbound $0.0075 per SMS, Inbound $0.0025 per SMS (typical Telnyx rates)
    if (telnyxSmsCost === 0 && allSms.length > 0) {
      const DEFAULT_OUTBOUND_SMS_COST = 0.0075; // $0.0075 per outbound SMS
      const DEFAULT_INBOUND_SMS_COST = 0.0025; // $0.0025 per inbound SMS
      
      const smsCostsFromRecords = allSms.reduce((acc, sms) => {
        // Use stored cost if available, otherwise use default pricing
        let smsCost = sms.cost;
        const carrierFee = sms.carrierFees || 0;
        
        // If cost is not set, use default pricing based on direction
        if (!smsCost || smsCost === 0) {
          if (sms.direction === "outbound") {
            smsCost = DEFAULT_OUTBOUND_SMS_COST;
          } else if (sms.direction === "inbound") {
            smsCost = DEFAULT_INBOUND_SMS_COST;
          } else {
            smsCost = DEFAULT_OUTBOUND_SMS_COST; // Default to outbound pricing
          }
        }
        
        const totalSmsCost = smsCost + carrierFee;
        
        acc.totalCost += totalSmsCost;
        acc.totalCarrierFees += carrierFee;
        acc.count += 1;
        
        if (sms.direction === "inbound") {
          acc.inboundCost += totalSmsCost;
        } else if (sms.direction === "outbound") {
          acc.outboundCost += totalSmsCost;
        }
        
        return acc;
      }, { totalCost: 0, inboundCost: 0, outboundCost: 0, totalCarrierFees: 0, count: 0 });
      
      telnyxSmsCost = parseFloat(smsCostsFromRecords.totalCost.toFixed(4));
      telnyxSmsCostInbound = parseFloat(smsCostsFromRecords.inboundCost.toFixed(4));
      telnyxSmsCostOutbound = parseFloat(smsCostsFromRecords.outboundCost.toFixed(4));
      totalSmsCarrierFees = parseFloat(smsCostsFromRecords.totalCarrierFees.toFixed(4));
      
      if (smsCostsFromRecords.count > 0) {
        avgCostPerSms = parseFloat((telnyxSmsCost / smsCostsFromRecords.count).toFixed(4));
      }
      
      // Update pending costs count since we've now calculated costs
      pendingSmsCosts = 0;
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
    let totalNumberMonthlyCost = (totalNumberCost * 30) / daysInPeriod; // Estimate monthly
    let totalNumberOneTimeCost = 0; // One-time costs handled separately if needed
    let totalNumberExtraFees = 0;

    // FALLBACK: If TelnyxCost is empty, calculate from PhoneNumber records directly
    // Phone number pricing: $1/month base + $1/month Telnyx recurring fee = $2/month total
    if (totalNumberCost === 0 && allNumbers.length > 0) {
      const BASE_MONTHLY_COST = 1.00; // $1 per month per number
      const TELNYX_RECURRING_FEE = 1.00; // $1 per month Telnyx recurring fee
      const TOTAL_MONTHLY_COST_PER_NUMBER = BASE_MONTHLY_COST + TELNYX_RECURRING_FEE; // $2/month total
      const DAILY_COST_PER_NUMBER = TOTAL_MONTHLY_COST_PER_NUMBER / 30; // $0.0667 per day per number
      
      const periodStart = startDate || new Date(0); // If no start date, use epoch (all time)
      const periodEnd = endDate || new Date();
      
      const numberCostsFromRecords = allNumbers.reduce((acc, number) => {
        // Use stored cost if available, otherwise use default pricing
        const monthlyCost = number.monthlyCost || TOTAL_MONTHLY_COST_PER_NUMBER;
        const oneTimeFees = number.oneTimeFees || 0;
        const extraFees = number.extraFees || 0;
        
        // Calculate how many days this number was active during the period
        const numberCreatedAt = number.createdAt ? new Date(number.createdAt) : new Date();
        
        // Number was active from its creation date (or period start, whichever is later) to period end
        const numberActiveStart = numberCreatedAt > periodStart ? numberCreatedAt : periodStart;
        const numberActiveEnd = periodEnd;
        
        // Calculate actual days this number was active in the period (use floor for accuracy)
        const millisecondsActive = numberActiveEnd - numberActiveStart;
        const actualDaysActive = Math.max(0, Math.floor(millisecondsActive / (1000 * 60 * 60 * 24)));
        
        // For very short periods (hours), calculate fractional days
        const hoursActive = millisecondsActive / (1000 * 60 * 60);
        const fractionalDays = hoursActive / 24;
        
        // Calculate cost for the actual time this number was active
        // Use fractional days for accuracy (especially for short periods)
        const periodCost = (monthlyCost / 30) * fractionalDays;
        
        acc.totalCost += periodCost + oneTimeFees + extraFees;
        acc.totalOneTime += oneTimeFees;
        acc.totalExtraFees += extraFees;
        acc.totalMonthly += monthlyCost;
        acc.totalDays += actualDaysActive;
        
        return acc;
      }, { totalCost: 0, totalOneTime: 0, totalExtraFees: 0, totalMonthly: 0, totalDays: 0 });
      
      totalNumberCost = parseFloat(numberCostsFromRecords.totalCost.toFixed(4));
      totalNumberOneTimeCost = parseFloat(numberCostsFromRecords.totalOneTime.toFixed(4));
      totalNumberExtraFees = parseFloat(numberCostsFromRecords.totalExtraFees.toFixed(4));
      
      // Calculate monthly equivalent: if period is 30 days, show actual monthly cost
      // Otherwise, prorate based on the period
      if (daysInPeriod > 0) {
        totalNumberMonthlyCost = parseFloat(((totalNumberCost * 30) / daysInPeriod).toFixed(2));
      } else {
        totalNumberMonthlyCost = parseFloat(numberCostsFromRecords.totalMonthly.toFixed(2));
      }
    }

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
