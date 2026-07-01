/**
 * windowQueryService
 *
 * Authoritative MongoDB queries for rolling-window live analytics.
 * Replaces hardcoded "active in 5 minutes" logic.
 */
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import StripeInvoice from "../../models/StripeInvoice.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import AnalyticsSession from "../../models/analytics/AnalyticsSession.js";
import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";
import AnalyticsPageView from "../../models/analytics/AnalyticsPageView.js";
import { ANALYTICS_EVENTS } from "../../constants/analyticsEvents.js";
import { resolveTimeframe, DEFAULT_TIMEFRAME } from "./timeframeService.js";
import { queryLegacyRealtime, legacySummaryToKpis } from "./legacyRealtimeService.js";
import { enrichRowsWithReturningStatus, countReturningInRange } from "./visitorClassificationService.js";

function sessionActivityMatch(start, end) {
  return {
    $or: [
      { lastActivityAt: { $gte: start, $lte: end } },
      { startedAt: { $gte: start, $lte: end } }
    ]
  };
}

function mapSessionToVisitorRow(doc) {
  const last = doc.lastActivityAt ? new Date(doc.lastActivityAt).getTime() : Date.now();
  const start = doc.startedAt ? new Date(doc.startedAt).getTime() : last;
  const idleSec = Math.max(0, Math.round((Date.now() - last) / 1000));
  const durSec = Math.max(0, Math.round((last - start) / 1000));
  const idleThreshold = 90;
  return {
    visitorId: doc.visitorId,
    sessionId: doc.sessionId,
    userId: doc.userId ? String(doc.userId) : null,
    currentPage: doc.exitPage || doc.entryPage || null,
    previousPage: null,
    currentUrl: doc.exitPage || doc.entryPage,
    pagesViewed: doc.pageViewCount || 0,
    sessionDurationSeconds: durSec,
    idleSeconds: idleSec,
    liveStatus: idleSec > idleThreshold ? "idle" : "active",
    country: doc.country,
    city: doc.city,
    region: doc.region,
    timezone: doc.timezone,
    latitude: doc.latitude,
    longitude: doc.longitude,
    device: doc.device,
    deviceBrand: doc.deviceBrand,
    browser: doc.browser,
    os: doc.os,
    screenResolution: doc.screenResolution,
    viewport: doc.viewport,
    language: doc.language,
    channel: doc.channel,
    source: doc.source,
    medium: doc.medium,
    campaign: doc.campaign,
    utmSource: doc.utmSource,
    utmMedium: doc.utmMedium,
    utmCampaign: doc.utmCampaign,
    utmContent: doc.utmContent,
    utmTerm: doc.utmTerm,
    referrer: doc.referrer,
    landingPage: doc.landingPage,
    gaClientId: doc.gaClientId,
    sessionStartedAt: doc.startedAt,
    lastActivityAt: doc.lastActivityAt,
    isReturning: doc.isReturning,
    isNew: !doc.isReturning,
    isSubscriber: doc.hasSubscription || false,
    signedUp: doc.signedUp || false,
    flags: {
      inCheckout: /billing|checkout|stripe/.test(String(doc.exitPage || "")),
      onPricing: /pricing|billing|plans/.test(String(doc.exitPage || "")),
      onSignup: /signup|register/.test(String(doc.exitPage || "")),
      onDashboard: /dashboard|dialer|campaign/.test(String(doc.exitPage || ""))
    },
    pageHistory: [],
    timeline: [],
    events: []
  };
}

async function enrichSessionsWithUsers(rows) {
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  if (!userIds.length) return rows;

  const [users, subs] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select("email name firstName lastName remainingCredits role")
      .lean(),
    Subscription.find({ userId: { $in: userIds }, status: "active" })
      .select("userId planName planKey status")
      .lean()
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const subMap = new Map(subs.map((s) => [String(s.userId), s]));

  return rows.map((row) => {
    const u = row.userId ? userMap.get(row.userId) : null;
    const sub = row.userId ? subMap.get(row.userId) : null;
    if (!u) return row;
    return {
      ...row,
      userName: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
      userEmail: u.email,
      remainingCredits: Number(u.remainingCredits || 0),
      isAdmin: u.role === "admin",
      subscriptionStatus: sub?.status || null,
      subscriptionPlan: sub?.planName || sub?.planKey || null,
      isSubscriber: !!sub || row.isSubscriber,
      planTier: sub?.planKey || sub?.planName || null
    };
  });
}

/**
 * Build authoritative window snapshot from MongoDB collections.
 */
export async function queryWindowSnapshot({ window = DEFAULT_TIMEFRAME, startDate, endDate, search, filters, page = 1, limit = 100 } = {}) {
  const tf = resolveTimeframe({ window, startDate, endDate });
  const { start, end } = tf;
  const match = sessionActivityMatch(start, end);

  const [
    legacyRealtime,
    sessions,
    sessionCount,
    uniqueVisitors,
    pageViews,
    signups,
    stripeRev,
    calls,
    sms,
    numbers,
    eventStream,
    purchases
  ] = await Promise.all([
    queryLegacyRealtime({ start, end, label: tf.label, tableLimit: Math.min(500, Math.max(1, Number(limit) || 100)) }),
    AnalyticsSession.find(match)
      .sort({ lastActivityAt: -1 })
      .limit(Math.min(500, limit * 3))
      .lean(),
    AnalyticsSession.countDocuments(match).maxTimeMS(12000),
    AnalyticsSession.distinct("visitorId", match),
    AnalyticsPageView.countDocuments({ timestamp: { $gte: start, $lte: end } }).maxTimeMS(12000),
    User.countDocuments({ createdAt: { $gte: start, $lte: end }, role: { $ne: "admin" } }).maxTimeMS(10000),
    StripeInvoice.aggregate([
      { $match: { status: "paid" } },
      { $addFields: { ts: { $ifNull: ["$issuedAt", "$createdAt"] } } },
      { $match: { ts: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: "$amountPaid" }, count: { $sum: 1 } } }
    ]).option({ maxTimeMS: 12000 }),
    Call.countDocuments({ createdAt: { $gte: start, $lte: end } }).maxTimeMS(10000),
    SMS.countDocuments({ createdAt: { $gte: start, $lte: end }, direction: "outbound" }).maxTimeMS(10000),
    PhoneNumber.countDocuments({
      $or: [
        { purchaseDate: { $gte: start, $lte: end } },
        { purchaseDate: null, createdAt: { $gte: start, $lte: end } }
      ]
    }).maxTimeMS(10000),
    AnalyticsEvent.find({ timestamp: { $gte: start, $lte: end } })
      .sort({ timestamp: -1 })
      .limit(120)
      .lean(),
    AnalyticsEvent.find({
      name: {
        $in: [
          ANALYTICS_EVENTS.PURCHASE,
          ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
          ANALYTICS_EVENTS.CREDIT_PURCHASED
        ]
      },
      timestamp: { $gte: start, $lte: end }
    })
      .sort({ timestamp: -1 })
      .limit(40)
      .lean()
  ]);

  let rows =
    sessions.length > 0
      ? sessions.map(mapSessionToVisitorRow)
      : legacyRealtime.rows;

  if (rows.length > 0) {
    rows = await enrichRowsWithReturningStatus(rows);
    rows = await enrichSessionsWithUsers(rows);
  }

  const q = String(search || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((s) =>
      [s.visitorId, s.sessionId, s.userId, s.userEmail, s.userName, s.country, s.city, s.currentPage]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }

  const f = filters || {};
  if (f.loggedIn) rows = rows.filter((s) => s.userId);
  if (f.anonymous) rows = rows.filter((s) => !s.userId);
  if (f.subscribers) rows = rows.filter((s) => s.isSubscriber);
  if (f.returning) rows = rows.filter((s) => s.isReturning);
  if (f.new) rows = rows.filter((s) => !s.isReturning);
  if (f.mobile) rows = rows.filter((s) => s.device === "mobile");
  if (f.desktop) rows = rows.filter((s) => s.device === "desktop");

  const revenue = Number((stripeRev[0]?.total || 0).toFixed(2));
  const purchaseCount = stripeRev[0]?.count || 0;

  const useLegacyKpis = legacyRealtime.rows.length > 0 && sessions.length === 0;
  const kpis = useLegacyKpis
    ? legacySummaryToKpis(legacyRealtime.summary, {
        calls,
        sms,
        purchases: purchaseCount,
        revenue,
        signups
      })
    : buildSessionKpis({
        rows,
        uniqueVisitors,
        sessionCount,
        signups,
        calls,
        sms,
        numbers,
        purchaseCount,
        revenue,
        pageViews
      });

  const geoMap = new Map();
  for (const s of rows) {
    const key = `${s.country || "Unknown"}|${s.city || ""}`;
    const row = geoMap.get(key) || {
      country: s.country || "Unknown",
      city: s.city || null,
      visitors: 0,
      signups: 0,
      purchases: 0,
      lat: s.latitude,
      lng: s.longitude,
      returning: 0,
      subscribers: 0,
      revenue: 0,
      calls: 0,
      sms: 0,
      avgSessionSeconds: 0
    };
    row.visitors += 1;
    if (s.isReturning) row.returning += 1;
    if (s.isSubscriber) row.subscribers += 1;
    geoMap.set(key, row);
  }

  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const p = Math.max(1, Number(page) || 1);
  const startIdx = (p - 1) * lim;
  const pageRows = rows.slice(startIdx, startIdx + lim);
  const windowTotal = useLegacyKpis
    ? legacyRealtime.summary?.tableRowsTotal || rows.length
    : rows.length;

  const devices = {};
  const browsers = {};
  const osMap = {};
  if (!useLegacyKpis) {
    for (const s of rows) {
      devices[s.device || "unknown"] = (devices[s.device || "unknown"] || 0) + 1;
      browsers[s.browser || "unknown"] = (browsers[s.browser || "unknown"] || 0) + 1;
      osMap[s.os || "unknown"] = (osMap[s.os || "unknown"] || 0) + 1;
    }
  }

  const toArr = (obj, key) =>
    Object.entries(obj)
      .map(([k, v]) => ({ [key]: k, count: v }))
      .sort((a, b) => b.count - a.count);

  const visitors = useLegacyKpis ? legacyRealtime.summary.totalUsers : uniqueVisitors.length;
  const returning = useLegacyKpis
    ? legacyRealtime.summary.returningVisitors || 0
    : rows.filter((s) => s.isReturning).length;
  const subscribedInWindow = kpis.subscribersOnline || 0;
  const funnel = [
    { step: "Visitors", count: visitors, rate: 100 },
    { step: "Pricing", count: kpis.visitorsOnPricing, rate: visitors ? (kpis.visitorsOnPricing / visitors) * 100 : 0 },
    { step: "Signup", count: kpis.visitorsOnSignup, rate: visitors ? (kpis.visitorsOnSignup / visitors) * 100 : 0 },
    { step: "Checkout", count: kpis.visitorsInCheckout, rate: visitors ? (kpis.visitorsInCheckout / visitors) * 100 : 0 },
    { step: "Subscription", count: subscribedInWindow, rate: visitors ? (subscribedInWindow / visitors) * 100 : 0 },
    { step: "Number Purchase", count: numbers, rate: visitors ? (numbers / visitors) * 100 : 0 },
    { step: "Calls", count: calls, rate: visitors ? (calls / visitors) * 100 : 0 },
    { step: "Returning", count: returning, rate: visitors ? (returning / visitors) * 100 : 0 }
  ].map((s) => ({ ...s, rate: Number(s.rate.toFixed(1)) }));

  const trafficMap = new Map();
  if (!useLegacyKpis) {
    for (const s of rows) {
      const key = s.source || s.channel || "unknown";
      const t = trafficMap.get(key) || { source: key, channel: s.channel || "unknown", visitors: 0, conversions: 0, revenue: 0 };
      t.visitors += 1;
      if (s.signedUp || s.isSubscriber) t.conversions += 1;
      trafficMap.set(key, t);
    }
  }

  const trafficSources = useLegacyKpis
    ? legacyRealtime.trafficSources || []
    : Array.from(trafficMap.values()).sort((a, b) => b.visitors - a.visitors);

  const devicePayload = useLegacyKpis
    ? legacyRealtime.deviceBreakdown || { devices: [], browsers: [], os: [], languages: [], darkModePercent: 0 }
    : {
      devices: toArr(devices, "device"),
      browsers: toArr(browsers, "browser"),
      os: toArr(osMap, "os"),
      languages: [],
      darkModePercent: 0
    };

  const geoPayload = useLegacyKpis
    ? legacyRealtime.geoBreakdown || Array.from(geoMap.values()).sort((a, b) => b.visitors - a.visitors)
    : Array.from(geoMap.values()).sort((a, b) => b.visitors - a.visitors);

  return {
    at: new Date().toISOString(),
    timeframe: { window: tf.window, label: tf.label, start: start.toISOString(), end: end.toISOString() },
    kpis,
    funnel,
    trafficSources,
    devices: devicePayload,
    geo: geoPayload,
    eventStream: eventStream.map((e) => ({
      kind: e.name,
      at: e.timestamp,
      visitorId: e.visitorId,
      sessionId: e.sessionId,
      userId: e.userId,
      value: e.value,
      country: e.country,
      label: e.page || e.name
    })),
    purchases: purchases.map((e) => ({
      kind: e.name,
      at: e.timestamp,
      value: e.value,
      userId: e.userId,
      country: e.country,
      label: e.name
    })),
    visitors: pageRows,
    pagination: {
      page: p,
      limit: lim,
      total: windowTotal,
      loaded: rows.length,
      totalPages: Math.ceil(windowTotal / lim) || 1
    },
    source: useLegacyKpis ? "legacy_analytics" : "mongodb_window",
    realtimeSummary: legacyRealtime.summary
  };
}

function buildSessionKpis({
  rows,
  uniqueVisitors,
  sessionCount,
  signups,
  calls,
  sms,
  numbers,
  purchaseCount,
  revenue,
  pageViews
}) {
  const loggedIn = rows.filter((s) => s.userId).length;
  const returning = rows.filter((s) => s.isReturning).length;
  const subscribers = rows.filter((s) => s.isSubscriber).length;
  const avgSession =
    rows.length > 0
      ? Math.round(rows.reduce((a, s) => a + (s.sessionDurationSeconds || 0), 0) / rows.length)
      : 0;
  const avgPages =
    rows.length > 0
      ? Number((rows.reduce((a, s) => a + (s.pagesViewed || 0), 0) / rows.length).toFixed(1))
      : 0;
  const activeNow = rows.filter((s) => (s.idleSeconds ?? 999) <= 300).length;

  return {
    activeVisitors: uniqueVisitors.length,
    activeNow,
    activeLoggedIn: loggedIn,
    anonymousVisitors: rows.length - loggedIn,
    returningVisitors: returning,
    newVisitors: rows.length - returning,
    subscribersOnline: subscribers,
    paidSubscribersOnline: subscribers,
    basicUsersOnline: rows.filter((s) => /basic/i.test(String(s.planTier || s.subscriptionPlan || ""))).length,
    superUsersOnline: rows.filter((s) => /super/i.test(String(s.planTier || s.subscriptionPlan || ""))).length,
    unlimitedUsersOnline: rows.filter((s) => /unlimited/i.test(String(s.planTier || s.subscriptionPlan || ""))).length,
    enterpriseUsersOnline: rows.filter((s) => /enterprise/i.test(String(s.planTier || s.subscriptionPlan || ""))).length,
    visitorsInCheckout: rows.filter((s) => s.flags?.inCheckout).length,
    visitorsOnPricing: rows.filter((s) => s.flags?.onPricing).length,
    visitorsOnSignup: rows.filter((s) => s.flags?.onSignup).length,
    visitorsOnDashboard: rows.filter((s) => s.flags?.onDashboard).length,
    liveCalls: calls,
    liveSms: sms,
    livePurchases: purchaseCount,
    liveRevenueWindow: revenue,
    liveSignups: signups,
    avgSessionSeconds: avgSession,
    avgActiveSeconds: avgSession,
    avgPagesViewed: avgPages,
    bounceRisk: 0,
    liveConversionRate:
      uniqueVisitors.length > 0
        ? Number(((signups / uniqueVisitors.length) * 100).toFixed(2))
        : 0,
    pageViews,
    sessionsInWindow: sessionCount,
    numbersPurchased: numbers
  };
}

export default { queryWindowSnapshot };
