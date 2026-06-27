import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Subscription from "../../models/Subscription.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import CreditLedger from "../../models/CreditLedger.js";
import User from "../../models/User.js";
import StripeInvoice from "../../models/StripeInvoice.js";
import { calculateAllUsersProfitability } from "../../services/userProfitabilityEngine.js";
import { getBillingTraceSnapshot } from "../../services/billingTraceService.js";
import { getStripe } from "../../../config/stripe.js";
import {
  syncPaidInvoicesFromStripe,
  getStripeRevenueSummaryFromMongo
} from "../../services/stripeInvoiceSyncService.js";
import { getTelnyxBillingSummary, calculateNumberCostsForPeriod, ACTIVE_PHONE_NUMBER_QUERY } from "../../services/telnyxBillingReportService.js";
import {
  getCallTelnyxCost,
  getSmsTelnyxCost,
} from "../../services/telnyxWebhookCostAggregationService.js";

const router = express.Router();

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
  const wantsStripeSync =
    req.query.stripeSync === "1" || req.query.liveSync === "1";
  const timeoutMs = 180000;

  let settled = false;
  const finish = (status, body) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    try {
      if (!res.headersSent) {
        res.status(status).json(body);
      }
    } catch (e) {
      console.error("Analytics finish error:", e.message);
    }
  };

  const timeout = setTimeout(() => {
    finish(504, {
      success: false,
      error: wantsStripeSync
        ? "Stripe sync timed out. Open the dashboard without live sync or narrow the date range."
        : "Request timeout - analytics query took too long. Please try a shorter time period."
    });
  }, timeoutMs);

  try {
    const { filter = "7d" } = req.query; // Default to 7d instead of 30d for faster queries
    const { startDate, endDate } = getDateRange(filter);
    
    const effectiveStartDate = startDate || new Date(0);
    const effectiveEndDate = endDate || new Date();
    
    const dateFilter = { createdAt: { $gte: effectiveStartDate, $lte: effectiveEndDate } };

    const wantsTelnyxSync = req.query.telnyxSync !== "0";

    const [
      mongoRevenueSummary,
      creditLedgerAgg,
      allCalls,
      allSms,
      allNumbers,
    ] = await Promise.all([
      getStripeRevenueSummaryFromMongo({
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
      }).catch(() => ({
        grossRevenue: 0,
        invoiceCount: 0,
        subscriptionRevenue: 0,
        addonRevenue: 0,
      })),
      CreditLedger.aggregate([
        {
          $match: {
            createdAt: { $gte: effectiveStartDate, $lte: effectiveEndDate },
          },
        },
        {
          $group: {
            _id: "$type",
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Call.find(dateFilter).sort({ createdAt: -1 }).limit(5000).lean(),
      SMS.find(dateFilter).sort({ createdAt: -1 }).limit(5000).lean(),
      PhoneNumber.find(ACTIVE_PHONE_NUMBER_QUERY).limit(1000).lean(),
    ]);

    const telnyxBilling = await getTelnyxBillingSummary({
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      activeNumbers: allNumbers,
      mongoCalls: allCalls,
      mongoSms: allSms,
      bypassCache: !wantsTelnyxSync,
    });

    // ================================
    // 1. TELNYX COSTS — Telnyx Detail Records + Usage Reports API
    // ================================
    let telnyxCostSource = telnyxBilling?.mongoSupplementUsed
      ? "telnyx_api+mongo"
      : telnyxBilling?.source || "inventory";
    let telnyxSync = {
      skipped: false,
      source: telnyxBilling?.source || "unavailable",
      recordTypeStats: telnyxBilling?.recordTypeStats || {},
      usageStats: telnyxBilling?.usageStats || {},
      fetchedAt: telnyxBilling?.fetchedAt || null,
      error: telnyxBilling?.error || null,
      mongoSupplementUsed: Boolean(telnyxBilling?.mongoSupplementUsed),
    };

    let telnyxCallCost = 0;
    let telnyxCallCostInbound = 0;
    let telnyxCallCostOutbound = 0;
    let telnyxSmsCost = 0;
    let telnyxSmsCostInbound = 0;
    let telnyxSmsCostOutbound = 0;
    let totalSmsCarrierFees = 0;
    let totalNumberCost = 0;
    let totalNumberMonthlyCost = 0;
    let totalNumberOneTimeCost = 0;
    let totalNumberExtraFees = 0;
    let activeNumbersCount = allNumbers.length;
    let totalBilledSeconds = 0;
    let totalRingingSeconds = 0;
    let totalAnsweredSeconds = 0;
    let pendingCallCosts = 0;
    let pendingSmsCosts = 0;
    let totalSmsCount = allSms.length;

    const numberCosts = calculateNumberCostsForPeriod(
      allNumbers,
      effectiveStartDate,
      effectiveEndDate
    );

    if (telnyxBilling?.success) {
      const calls = telnyxBilling.calls || {};
      const sms = telnyxBilling.sms || {};
      const numbers = telnyxBilling.numbers || {};

      telnyxCallCost = Number(calls.totalCost || 0);
      telnyxCallCostInbound = Number(calls.inboundCost || 0);
      telnyxCallCostOutbound = Number(calls.outboundCost || 0);
      totalBilledSeconds = Number(calls.totalBilledSeconds || 0);

      telnyxSmsCost = Number(sms.totalCost || 0);
      telnyxSmsCostInbound = Number(sms.inboundCost || 0);
      telnyxSmsCostOutbound = Number(sms.outboundCost || 0);
      totalSmsCarrierFees = Number(sms.carrierFees || 0);
      totalSmsCount = Number(sms.count || allSms.length);

      totalNumberCost = Number(numbers.totalCost || 0);
      totalNumberMonthlyCost = Number(numbers.monthlyCost || 0);
      totalNumberOneTimeCost = Number(numbers.oneTimeCost || 0);
      totalNumberExtraFees = Number(numbers.extraFees || 0);
      activeNumbersCount = Number(numbers.activeCount || allNumbers.length);
    }

    // Inventory numbers are always $2/mo prorated to the selected window (incl. hour filters).
    totalNumberCost = Number(numberCosts.totalCost || totalNumberCost);
    totalNumberMonthlyCost = Number(numberCosts.monthlyCost || totalNumberMonthlyCost);
    totalNumberOneTimeCost = Number(numberCosts.oneTimeCost || totalNumberOneTimeCost);
    totalNumberExtraFees = Number(numberCosts.extraFees || totalNumberExtraFees);
    activeNumbersCount = Number(numberCosts.activeCount || activeNumbersCount);

    for (const call of allCalls) {
      const cost = getCallTelnyxCost(call);
      const billedSecs =
        Number(call.billedSeconds) ||
        Number(call.durationSeconds) ||
        Number(call.duration) ||
        0;
      if (billedSecs > 0 && cost <= 0 && !call.costSyncedAt) pendingCallCosts += 1;
    }

    for (const sms of allSms) {
      const cost = getSmsTelnyxCost(sms);
      if (cost <= 0 && !sms.costSyncedAt && sms.status !== "failed") pendingSmsCosts += 1;
    }

    // Usage timing from local call records (ringing/answered breakdown in UI)
    if (totalRingingSeconds === 0 && totalAnsweredSeconds === 0) {
      for (const call of allCalls) {
        const billedSecs =
          Number(call.billedSeconds) ||
          Number(call.durationSeconds) ||
          Number(call.duration) ||
          0;
        totalRingingSeconds += Number(call.ringingDuration || 0);
        totalAnsweredSeconds +=
          Number(call.answeredDuration || 0) ||
          Math.max(0, billedSecs - Number(call.ringingDuration || 0));
      }
    }

    if (telnyxBilling?.success && totalBilledSeconds === 0) {
      for (const call of allCalls) {
        totalBilledSeconds +=
          Number(call.billedSeconds) ||
          Number(call.durationSeconds) ||
          Number(call.duration) ||
          0;
      }
    }

    let totalCallMinutes = totalBilledSeconds / 60;
    let avgCostPerSecond = 0;
    let avgCostPerMinute = 0;
    if (totalBilledSeconds > 0) {
      avgCostPerSecond = telnyxCallCost / totalBilledSeconds;
      avgCostPerMinute = avgCostPerSecond * 60;
    }

    const ringingSecondsCost =
      totalBilledSeconds > 0
        ? (totalRingingSeconds / totalBilledSeconds) * telnyxCallCost
        : 0;
    const answeredSecondsCost =
      totalBilledSeconds > 0
        ? (totalAnsweredSeconds / totalBilledSeconds) * telnyxCallCost
        : 0;

    let avgCostPerSms = totalSmsCount > 0 ? telnyxSmsCost / totalSmsCount : 0;

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const periodMs = startDate ? endDate.getTime() - startDate.getTime() : 365 * MS_PER_DAY;
    const daysInPeriod = startDate ? periodMs / MS_PER_DAY : 365;
    const hoursInPeriod = periodMs / (60 * 60 * 1000);

    if (totalNumberMonthlyCost <= 0 && totalNumberCost > 0 && daysInPeriod > 0) {
      totalNumberMonthlyCost = (totalNumberCost * 30) / daysInPeriod;
    }

    const totalTelnyxCost = telnyxCallCost + telnyxSmsCost + totalNumberCost;

    let grossRevenue = Number(mongoRevenueSummary.grossRevenue) || 0;
    const ledgerByType = Object.fromEntries(
      creditLedgerAgg.map((row) => [String(row._id), row])
    );
    const totalCreditsGranted = Math.max(
      0,
      (ledgerByType.subscription_credit_grant?.totalAmount || 0) +
        (ledgerByType.add_on_purchase?.totalAmount || 0) +
        (ledgerByType.admin_adjustment?.totalAmount || 0) +
        (ledgerByType.refund?.totalAmount || 0) +
        (ledgerByType.migration_conversion?.totalAmount || 0) +
        (ledgerByType.migration_reset?.totalAmount || 0)
    );
    const totalCreditsConsumed = Math.abs(
      (ledgerByType.outbound_attempt_charge?.totalAmount || 0) +
        // v1 telecom rating lifecycle milestone charges (routed/ringing/answered/etc.)
        (ledgerByType.call_event_charge?.totalAmount || 0) +
        (ledgerByType.connected_duration_charge?.totalAmount || 0) +
        (ledgerByType.sms_charge?.totalAmount || 0)
    );
    let stripeInvoiceCount = Number(mongoRevenueSummary.invoiceCount) || 0;
    let subscriptionRevenue = Number(mongoRevenueSummary.subscriptionRevenue) || 0;
    let addonRevenue = Number(mongoRevenueSummary.addonRevenue) || 0;

    // ================================
    // 2. STRIPE COSTS - FULL BREAKDOWN (revenue summary from Mongo loaded above)
    // ================================
    let stripeProcessingFees = 0;
    let refunds = 0;
    let netRevenue = 0;
    let stripeSync = {
      skipped: true,
      synced: 0,
      scanned: 0,
      pages: 0,
      reason: wantsStripeSync ? undefined : "dashboard_uses_mongo_only"
    };

    if (wantsStripeSync) {
      try {
        stripeSync = await syncPaidInvoicesFromStripe({
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
          maxPages: filter === "all" ? 10 : 4
        });
      } catch (syncErr) {
        console.warn("Stripe invoice sync warning:", syncErr.message);
      }
    }

    // Stripe fee estimate fallback (2.9% + $0.30 per paid invoice).
    stripeProcessingFees = (grossRevenue * 0.029) + (stripeInvoiceCount * 0.30);

    const stripe = getStripe();
    if (stripe) {
      const REFUND_LIST_MS = 10000;
      try {
        const refundList = await Promise.race([
          stripe.refunds.list({
            limit: 100,
            created: {
              gte: Math.floor(effectiveStartDate.getTime() / 1000),
              lte: Math.floor(effectiveEndDate.getTime() / 1000)
            }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("stripe_refund_list_timeout")), REFUND_LIST_MS)
          )
        ]);
        refunds = refundList.data.reduce((sum, refund) => sum + (refund.amount || 0) / 100, 0);
      } catch (refundErr) {
        console.warn("Stripe refund sync warning:", refundErr.message);
      }
    }

    netRevenue = grossRevenue - stripeProcessingFees - refunds;

    // ================================
    // 3. PROFIT CALCULATION
    // ================================
    const netProfit = netRevenue - totalTelnyxCost;
    const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    // ================================
    // 4. PER-USER METRICS (OPTIMIZED)
    // ================================
    const subscriptions = await Subscription.find().limit(1000).lean();
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
    const failedCalls = allCalls.filter((c) =>
      ["failed", "no-answer", "busy", "rejected", "canceled"].includes(c.status)
    );
    
    const sentSms = allSms.filter(s => s.direction === "outbound");
    const receivedSms = allSms.filter(s => s.direction === "inbound");
    const failedSms = allSms.filter(s => s.status === "failed");
    const answeredCalls = outboundCalls.filter((c) =>
      ["answered", "in-progress", "completed"].includes(String(c.status || "").toLowerCase())
    );
    const rejectedLikeCalls = outboundCalls.filter((c) =>
      ["rejected", "busy", "no-answer", "failed", "canceled"].includes(
        String(c.status || "").toLowerCase()
      )
    );
    const shortCallThresholdSeconds = 20;
    const shortAnsweredCalls = answeredCalls.filter(
      (c) => Number(c.billedSeconds ?? c.durationSeconds ?? 0) <= shortCallThresholdSeconds
    );
    const asr =
      outboundCalls.length > 0 ? (answeredCalls.length / outboundCalls.length) * 100 : 0;
    const avgAnsweredSeconds =
      answeredCalls.length > 0
        ? answeredCalls.reduce(
            (sum, c) => sum + Number(c.billedSeconds ?? c.durationSeconds ?? 0),
            0
          ) / answeredCalls.length
        : 0;
    const creditsBurnedOnRejectedCalls = Math.round(
      Math.abs(ledgerByType.outbound_attempt_charge?.totalAmount || 0) +
        // v1: pre-connection lifecycle charges (routed/ringing/busy/no_answer/failed/answered)
        Math.abs(ledgerByType.call_event_charge?.totalAmount || 0)
    );
    const answeredDurationCredits = Math.round(
      Math.abs(ledgerByType.connected_duration_charge?.totalAmount || 0)
    );
    const creditsPerAnsweredCall =
      answeredCalls.length > 0
        ? (creditsBurnedOnRejectedCalls + answeredDurationCredits) / answeredCalls.length
        : 0;

    const callStatsByUser = new Map();
    for (const call of outboundCalls) {
      const key = String(call.user || "");
      if (!key) continue;
      const entry = callStatsByUser.get(key) || {
        outboundAttempts: 0,
        answered: 0,
        rejectedLike: 0,
        shortAnswered: 0,
        totalAnsweredSeconds: 0,
      };
      entry.outboundAttempts += 1;
      const status = String(call.status || "").toLowerCase();
      const billedSeconds = Number(call.billedSeconds ?? call.durationSeconds ?? 0);
      const answered = ["answered", "in-progress", "completed"].includes(status);
      if (answered) {
        entry.answered += 1;
        entry.totalAnsweredSeconds += billedSeconds;
        if (billedSeconds <= shortCallThresholdSeconds) entry.shortAnswered += 1;
      }
      if (["rejected", "busy", "no-answer", "failed", "canceled"].includes(status)) {
        entry.rejectedLike += 1;
      }
      callStatsByUser.set(key, entry);
    }

    const userRevenue = new Map();
    const userCosts = new Map();
    const paidInvoices = await StripeInvoice.find({
        status: "paid",
        createdAt: { $gte: effectiveStartDate, $lte: effectiveEndDate },
      })
      .select("userId amountPaid")
      .lean();
    for (const inv of paidInvoices) {
      const key = inv?.userId ? String(inv.userId) : "";
      if (!key) continue;
      userRevenue.set(key, Number(userRevenue.get(key) || 0) + Number(inv.amountPaid || 0));
    }
    for (const c of allCalls) {
      const key = c?.user ? String(c.user) : "";
      if (!key) continue;
      userCosts.set(key, Number(userCosts.get(key) || 0) + getCallTelnyxCost(c));
    }
    for (const s of allSms) {
      const key = s?.user ? String(s.user) : "";
      if (!key) continue;
      userCosts.set(key, Number(userCosts.get(key) || 0) + getSmsTelnyxCost(s));
    }

    const riskRows = Array.from(callStatsByUser.entries()).map(([userId, stats]) => {
      const rejectRatio =
        stats.outboundAttempts > 0 ? stats.rejectedLike / stats.outboundAttempts : 0;
      const shortCallRatio =
        stats.answered > 0 ? stats.shortAnswered / stats.answered : 0;
      const revenue = Number(userRevenue.get(userId) || 0);
      const telnyxCost = Number(userCosts.get(userId) || 0);
      const grossMarginEstimate = revenue - telnyxCost;
      return {
        userId,
        outboundAttempts: stats.outboundAttempts,
        answeredCalls: stats.answered,
        rejectRatio: Number((rejectRatio * 100).toFixed(2)),
        shortCallRatio: Number((shortCallRatio * 100).toFixed(2)),
        avgAnsweredSeconds:
          stats.answered > 0 ? Number((stats.totalAnsweredSeconds / stats.answered).toFixed(2)) : 0,
        telnyxCostEstimate: Number(telnyxCost.toFixed(4)),
        subscriptionRevenueEstimate: Number(revenue.toFixed(2)),
        grossMarginEstimate: Number(grossMarginEstimate.toFixed(2)),
        riskScore:
          Number((rejectRatio * 0.5 + shortCallRatio * 0.5).toFixed(4)),
      };
    });
    const topOutboundAttemptUsers = [...riskRows]
      .sort((a, b) => b.outboundAttempts - a.outboundAttempts)
      .slice(0, 20);
    const highRejectRatioUsers = [...riskRows]
      .filter((u) => u.outboundAttempts >= 10)
      .sort((a, b) => b.rejectRatio - a.rejectRatio)
      .slice(0, 20);
    const shortCallHeavyUsers = [...riskRows]
      .filter((u) => u.answeredCalls >= 5)
      .sort((a, b) => b.shortCallRatio - a.shortCallRatio)
      .slice(0, 20);
    const negativeMarginUsers = [...riskRows]
      .filter((u) => u.grossMarginEstimate < 0)
      .sort((a, b) => a.grossMarginEstimate - b.grossMarginEstimate)
      .slice(0, 20);
    const profitEngine = await calculateAllUsersProfitability({
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    }).catch(() => ({ users: [] }));
    const profitUsers = Array.isArray(profitEngine?.users) ? profitEngine.users : [];
    const topLosingUsers = [...profitUsers]
      .sort((a, b) => Number(a.gross_margin || 0) - Number(b.gross_margin || 0))
      .slice(0, 20);
    const topAbusingUsers = [...profitUsers]
      .filter((u) => Number(u.outbound_attempts || 0) >= 10)
      .sort((a, b) => Number(b.reject_ratio || 0) - Number(a.reject_ratio || 0))
      .slice(0, 20);
    const marginHeatmap = [...profitUsers]
      .sort((a, b) => Number(a.margin_ratio || 0) - Number(b.margin_ratio || 0))
      .slice(0, 100)
      .map((u) => ({
        userId: u.userId,
        marginRatio: Number(u.margin_ratio || 0),
        grossMargin: Number(u.gross_margin || 0),
        telnyxCost: Number(u.total_telnyx_cost_estimate || 0),
        revenue: Number(u.total_subscription_revenue || 0),
        rejectRatio: Number(u.reject_ratio || 0),
      }));
    const costVsRevenueSeries = [...profitUsers]
      .sort((a, b) => Number(b.total_telnyx_cost_estimate || 0) - Number(a.total_telnyx_cost_estimate || 0))
      .slice(0, 40)
      .map((u) => ({
        userId: u.userId,
        cost: Number(u.total_telnyx_cost_estimate || 0),
        revenue: Number(u.total_subscription_revenue || 0),
        grossMargin: Number(u.gross_margin || 0),
      }));

    const ledgerWindowMatch = {
      createdAt: { $gte: effectiveStartDate, $lte: effectiveEndDate },
    };
    const traceSnap = getBillingTraceSnapshot({ limit: 80 });
    const [
      billingNegativeUsers,
      billingDuplicateKeys,
      billingOrphanLedger,
      billingHangingReservations,
      billingHighFrequency,
    ] = await Promise.all([
      User.find({ remainingCredits: { $lt: 0 } })
        .select("_id email remainingCredits reservedCredits")
        .limit(20)
        .lean(),
      CreditLedger.aggregate([
        { $match: ledgerWindowMatch },
        { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $limit: 25 },
      ]),
      CreditLedger.find({
        ...ledgerWindowMatch,
        type: { $in: ["connected_duration_charge", "outbound_attempt_charge"] },
        $or: [{ callId: null }, { callId: { $exists: false } }],
      })
        .select("_id idempotencyKey type createdAt")
        .limit(20)
        .lean(),
      Call.find({
        direction: "outbound",
        status: { $in: ["completed", "failed", "rejected", "canceled", "busy", "no-answer"] },
        creditReservationHeld: { $gt: 0 },
        creditReservationReleasedAt: null,
        updatedAt: { $gte: effectiveStartDate, $lte: effectiveEndDate },
      })
        .select("_id user creditReservationHeld status")
        .limit(20)
        .lean(),
      CreditLedger.aggregate([
        { $match: ledgerWindowMatch },
        { $group: { _id: "$user", events: { $sum: 1 }, netCredits: { $sum: "$amount" } } },
        { $sort: { events: -1 } },
        { $limit: 20 },
      ]),
    ]);

    const billingIntegrity = {
      processNote:
        "Runtime duplicate skips are counted when applyBillingEvent receives the same idempotencyKey twice; Mongo unique index prevents double rows.",
      duplicateLedgerKeyGroups: billingDuplicateKeys,
      duplicateRuntimeSkips: traceSnap.duplicateSkipCount,
      failedLedgerWrites: traceSnap.ledgerWriteFailureCount,
      negativeBalanceUsers: billingNegativeUsers,
      orphanLedgerEntries: billingOrphanLedger,
      unreleasedCallReservations: billingHangingReservations,
      highestBillingFrequencyUsers: billingHighFrequency.map((row) => ({
        userId: String(row._id),
        ledgerEventsInWindow: row.events,
        netCreditsInWindow: Number(row.netCredits || 0),
      })),
      abnormalChargeSpikes: billingHighFrequency
        .filter((row) => row.events >= 50 && Number(row.netCredits || 0) <= -100)
        .slice(0, 10)
        .map((row) => ({
          userId: String(row._id),
          ledgerEventsInWindow: row.events,
          netCreditsInWindow: Number(row.netCredits || 0),
        })),
      recentTraces: traceSnap.traces,
      recentDuplicateKeys: traceSnap.recentDuplicateKeys,
    };

    finish(200, {
      success: true,
      filter,
      telnyxSync,
      telnyxCostSource,
      period: {
        startDate: startDate?.toISOString() || null,
        endDate: endDate.toISOString(),
        days: parseFloat(daysInPeriod.toFixed(4)),
        hours: parseFloat(hoursInPeriod.toFixed(4)),
        periodMs: Math.round(periodMs),
      },
      financial: {
        // Stripe
        grossRevenue: parseFloat(grossRevenue.toFixed(2)),
        stripeProcessingFees: parseFloat(stripeProcessingFees.toFixed(2)),
        refunds: parseFloat(refunds.toFixed(2)),
        netRevenue: parseFloat(netRevenue.toFixed(2)),
        stripeInvoiceCount,
        subscriptionRevenue: parseFloat(subscriptionRevenue.toFixed(2)),
        addonRevenue: parseFloat(addonRevenue.toFixed(2)),
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
          pendingCosts: pendingCallCosts,
          apiSyncedCount: telnyxBilling?.calls?.count || 0,
        },
        sms: {
          totalCost: parseFloat(telnyxSmsCost.toFixed(4)),
          inboundCost: parseFloat(telnyxSmsCostInbound.toFixed(4)),
          outboundCost: parseFloat(telnyxSmsCostOutbound.toFixed(4)),
          carrierFees: parseFloat(totalSmsCarrierFees.toFixed(4)),
          avgCostPerSms: parseFloat(avgCostPerSms.toFixed(4)),
          pendingCosts: pendingSmsCosts,
          apiSyncedCount: telnyxBilling?.sms?.count || 0,
        },
        numbers: {
          activeCount: activeNumbersCount,
          monthlyRateUsd: numberCosts.monthlyRateUsd,
          monthlyCost: parseFloat(totalNumberMonthlyCost.toFixed(2)),
          monthlyCostForPeriod: parseFloat(totalNumberCost.toFixed(4)),
          oneTimeCost: parseFloat(totalNumberOneTimeCost.toFixed(2)),
          extraFees: parseFloat(totalNumberExtraFees.toFixed(2)),
          totalCost: parseFloat(totalNumberCost.toFixed(4)),
          periodMs: numberCosts.periodMs,
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
        failedCalls: failedCalls.length,
        answerSeizureRatio: Number(asr.toFixed(2)),
        averageAnsweredCallDurationSeconds: Number(avgAnsweredSeconds.toFixed(2)),
        creditsBurnedPerAnsweredCall: Number(creditsPerAnsweredCall.toFixed(2)),
        creditsBurnedOnRejectedCalls
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
      },
      credits: {
        totalGranted: Math.round(totalCreditsGranted),
        totalConsumed: Math.round(totalCreditsConsumed),
        outboundAttemptCharges: Math.round(
          Math.abs(ledgerByType.outbound_attempt_charge?.totalAmount || 0)
        ),
        callEventCharges: Math.round(
          Math.abs(ledgerByType.call_event_charge?.totalAmount || 0)
        ),
        connectedDurationCharges: Math.round(
          Math.abs(ledgerByType.connected_duration_charge?.totalAmount || 0)
        ),
        smsCharges: Math.round(Math.abs(ledgerByType.sms_charge?.totalAmount || 0)),
      },
      telecomRisk: {
        highRiskUsers: riskRows
          .filter((r) => r.outboundAttempts >= 10)
          .sort((a, b) => b.riskScore - a.riskScore)
          .slice(0, 20),
        highRejectRatioUsers,
        shortCallHeavyUsers,
        topOutboundAttemptUsers,
        negativeMarginUsers,
        marginHeatmap,
        topLosingUsers: topLosingUsers.map((u) => ({
          userId: u.userId,
          grossMargin: Number(u.gross_margin || 0),
          marginRatio: Number(u.margin_ratio || 0),
          telnyxCost: Number(u.total_telnyx_cost_estimate || 0),
          revenue: Number(u.total_subscription_revenue || 0),
          rejectRatio: Number(u.reject_ratio || 0),
          avgCallDuration: Number(u.avg_call_duration || 0),
          outboundAttempts: Number(u.outbound_attempts || 0),
        })),
        topAbusingUsers: topAbusingUsers.map((u) => ({
          userId: u.userId,
          rejectRatio: Number(u.reject_ratio || 0),
          avgCallDuration: Number(u.avg_call_duration || 0),
          outboundAttempts: Number(u.outbound_attempts || 0),
          shortCallRatio: Number(u.short_call_ratio || 0),
          grossMargin: Number(u.gross_margin || 0),
          marginRatio: Number(u.margin_ratio || 0),
        })),
        costVsRevenueSeries,
      },
      billingIntegrity,
      stripeSync
    });
  } catch (err) {
    console.error("Enhanced analytics error:", err);
    finish(500, {
      success: false,
      error: err.message || "Failed to fetch enhanced analytics"
    });
  }
});

export default router;
