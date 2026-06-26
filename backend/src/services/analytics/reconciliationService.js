/**
 * reconciliationService
 *
 * Validates dashboard metrics against authoritative MongoDB / Stripe sources.
 * Never silently ignores mismatches.
 */
import mongoose from "mongoose";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import StripeInvoice from "../../models/StripeInvoice.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import CreditLedger from "../../models/CreditLedger.js";
import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";
import { ANALYTICS_EVENTS } from "../../constants/analyticsEvents.js";
import { isMeasurementProtocolConfigured } from "./gaMeasurementProtocolService.js";

const TOLERANCE = {
  count: 0,
  revenue: 0.01
};

function check(metric, dashboard, source, collection, opts = {}) {
  const d = Number(dashboard ?? 0);
  const s = Number(source ?? 0);
  const tolerance = opts.tolerance ?? (opts.type === "revenue" ? TOLERANCE.revenue : TOLERANCE.count);
  const delta = Number((d - s).toFixed(opts.type === "revenue" ? 2 : 0));
  const match = Math.abs(delta) <= tolerance;
  return {
    metric,
    dashboard: d,
    source: s,
    collection,
    match,
    delta,
    informational: opts.informational === true,
    severity: match ? "ok" : Math.abs(delta) > tolerance * 10 ? "critical" : "warning"
  };
}

function pickMetric(passed, built, fallback) {
  if (passed != null && passed !== undefined) return passed;
  if (built != null && built !== undefined) return built;
  return fallback;
}

async function loadBuiltMetrics(start, end) {
  try {
    const mod = await import("./aggregationService.js");
    return mod.buildReconciliationMetrics(start, end);
  } catch (e) {
    console.warn("[analytics:reconcile] buildReconciliationMetrics failed:", e?.message);
    return null;
  }
}

async function countStripeRevenue(start, end) {
  const agg = await StripeInvoice.aggregate([
    { $match: { status: "paid" } },
    { $addFields: { ts: { $ifNull: ["$issuedAt", "$createdAt"] } } },
    { $match: { ts: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: "$amountPaid" }, count: { $sum: 1 } } }
  ]).option({ maxTimeMS: 12000 });
  return {
    revenue: Number((agg[0]?.total || 0).toFixed(2)),
    orders: agg[0]?.count || 0
  };
}

async function countAnalyticsRevenue(start, end) {
  const agg = await AnalyticsEvent.aggregate([
    {
      $match: {
        name: {
          $in: [
            ANALYTICS_EVENTS.PURCHASE,
            ANALYTICS_EVENTS.PAYMENT_SUCCEEDED,
            ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
            ANALYTICS_EVENTS.CREDIT_PURCHASED
          ]
        },
        timestamp: { $gte: start, $lte: end }
      }
    },
    { $group: { _id: null, total: { $sum: "$value" }, count: { $sum: 1 } } }
  ]).option({ maxTimeMS: 12000 });
  return {
    revenue: Number((agg[0]?.total || 0).toFixed(2)),
    events: agg[0]?.count || 0
  };
}

async function countGa4ProxyEvents(start, end) {
  const purchaseEvents = await AnalyticsEvent.countDocuments({
    name: {
      $in: [ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED, ANALYTICS_EVENTS.PURCHASE]
    },
    timestamp: { $gte: start, $lte: end }
  }).maxTimeMS(10000);

  const stripePaid = await StripeInvoice.countDocuments({
    status: "paid",
    $and: [
      {
        $or: [
          { purchaseType: "subscription" },
          { purchaseType: "unknown", subscriptionId: { $ne: null } }
        ]
      },
      {
        $or: [
          { issuedAt: { $gte: start, $lte: end } },
          { issuedAt: null, createdAt: { $gte: start, $lte: end } }
        ]
      }
    ]
  }).maxTimeMS(10000);

  return { purchaseEvents, stripePaid };
}

/**
 * Run full reconciliation for a time window + dashboard snapshot.
 */
export async function runReconciliation({ start, end, overview = {}, revenue = null, subscriptions = null } = {}) {
  const startedAt = Date.now();
  const built = await loadBuiltMetrics(start, end);

  const [
    totalUsers,
    paidSubscriptions,
    activeSubscriptions,
    callsDb,
    smsDb,
    numbersDb,
    creditsLedgerSum,
    signupsDb,
    stripeTotals,
    analyticsRevenue,
    ga4Proxy,
    duplicateEvents
  ] = await Promise.all([
    User.countDocuments({ role: { $ne: "admin" } }).maxTimeMS(10000),
    Subscription.countDocuments({ status: "active" }).maxTimeMS(10000),
    Subscription.countDocuments({ createdAt: { $gte: start, $lte: end } }).maxTimeMS(10000),
    Call.countDocuments({ createdAt: { $gte: start, $lte: end } }).maxTimeMS(10000),
    SMS.countDocuments({ createdAt: { $gte: start, $lte: end }, direction: "outbound" }).maxTimeMS(10000),
    PhoneNumber.countDocuments({
      $or: [
        { purchaseDate: { $gte: start, $lte: end } },
        { purchaseDate: null, createdAt: { $gte: start, $lte: end } }
      ]
    }).maxTimeMS(10000),
    CreditLedger.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).option({ maxTimeMS: 10000 }),
    User.countDocuments({ createdAt: { $gte: start, $lte: end }, role: { $ne: "admin" } }).maxTimeMS(10000),
    countStripeRevenue(start, end),
    countAnalyticsRevenue(start, end),
    countGa4ProxyEvents(start, end),
    AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, eventId: { $ne: null } } },
      { $group: { _id: "$eventId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: "duplicates" }
    ]).option({ maxTimeMS: 10000 })
  ]);

  const sessionsSource = built?.additive?.sessions ?? built?.overview?.sessions ?? 0;

  const dashboardTotalUsers = pickMetric(
    overview.totalUsersAllTime,
    built?.overview?.totalUsersAllTime,
    totalUsers
  );
  const dashboardPaidSubs = pickMetric(
    overview.paidSubscribers ?? subscriptions?.active,
    built?.overview?.paidSubscribers,
    paidSubscriptions
  );
  const dashboardSignups = pickMetric(overview.signUps, built?.overview?.signUps, signupsDb);
  const dashboardSessions = pickMetric(overview.sessions, built?.overview?.sessions, sessionsSource);
  const dashboardRevenue = revenue?.totalRevenue ?? pickMetric(overview.revenue, built?.overview?.revenue, stripeTotals.revenue);

  const creditsPurchased = Number(creditsLedgerSum[0]?.total || 0);

  const callEvents = await AnalyticsEvent.countDocuments({
    name: { $in: [ANALYTICS_EVENTS.CALL_COMPLETED, ANALYTICS_EVENTS.CALL_OUTGOING, ANALYTICS_EVENTS.FIRST_CALL] },
    timestamp: { $gte: start, $lte: end }
  }).maxTimeMS(8000);

  const smsEvents = await AnalyticsEvent.countDocuments({
    name: ANALYTICS_EVENTS.SMS_SENT,
    timestamp: { $gte: start, $lte: end }
  }).maxTimeMS(8000);

  const numberEvents = await AnalyticsEvent.countDocuments({
    name: ANALYTICS_EVENTS.NUMBER_PURCHASED,
    timestamp: { $gte: start, $lte: end }
  }).maxTimeMS(8000);

  const coreChecks = [
    check("totalUsers", dashboardTotalUsers, totalUsers, "users"),
    check("paidSubscribers", dashboardPaidSubs, paidSubscriptions, "subscriptions", { type: "count" }),
    check("signupsInRange", dashboardSignups, signupsDb, "users"),
    check("sessionsInRange", dashboardSessions, sessionsSource, "analytics_sessions"),
    check("revenue", dashboardRevenue, stripeTotals.revenue, "stripe_invoices", { type: "revenue" })
  ];

  const crossChecks = [
    check("analyticsRevenueVsStripe", analyticsRevenue.revenue, stripeTotals.revenue, "analytics_events_vs_stripe", {
      type: "revenue",
      informational: true
    }),
    check("calls", callEvents, callsDb, "calls", { informational: true }),
    check("sms", smsEvents, smsDb, "sms", { informational: true }),
    check("numberPurchases", numberEvents, numbersDb, "phone_numbers", { informational: true }),
    check("ga4PurchasesVsStripe", ga4Proxy.purchaseEvents, ga4Proxy.stripePaid, "ga4_proxy_vs_stripe", {
      informational: true
    })
  ];

  const checks = [...coreChecks, ...crossChecks];
  const warnings = checks.filter((c) => !c.match && !c.informational);
  const informationalWarnings = checks.filter((c) => !c.match && c.informational);
  const healthy = warnings.length === 0;

  if (warnings.length) {
    console.warn(
      "[analytics:reconcile] mismatches:",
      warnings.map((w) => `${w.metric}: dashboard=${w.dashboard} source=${w.source} (Δ${w.delta})`)
    );
  }

  return {
    healthy,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    checks,
    warnings,
    informationalWarnings,
    ga4: {
      configured: isMeasurementProtocolConfigured(),
      purchaseEventsInRange: ga4Proxy.purchaseEvents,
      stripePaidInRange: ga4Proxy.stripePaid,
      aligned: ga4Proxy.purchaseEvents === ga4Proxy.stripePaid
    },
    dataQuality: {
      duplicateEventIds: duplicateEvents[0]?.duplicates || 0,
      creditsPurchasedInRange: creditsPurchased,
      newSubscriptionsInRange: activeSubscriptions
    },
    sources: {
      totalUsers,
      paidSubscriptions,
      callsDb,
      smsDb,
      numbersDb,
      stripeRevenue: stripeTotals.revenue,
      stripeOrders: stripeTotals.orders,
      analyticsRevenue: analyticsRevenue.revenue,
      sessionsInRange: sessionsSource
    }
  };
}

export default { runReconciliation };
