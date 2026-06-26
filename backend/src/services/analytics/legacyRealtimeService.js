/**
 * legacyRealtimeService
 *
 * Authoritative realtime KPIs from the legacy Analytics visit collection —
 * same semantics as GET /api/analytics/admin/dashboard realtime block.
 */
import geoip from "geoip-lite";
import Analytics from "../../models/Analytics.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";

const ACTIVE_NOW_MS = 5 * 60 * 1000;

function normalizePlanTier(planKey, planName) {
  const raw = String(planKey || planName || "").toLowerCase();
  if (raw.includes("enterprise")) return "enterprise";
  if (raw.includes("unlimited")) return "unlimited";
  if (raw.includes("super")) return "super";
  if (raw.includes("basic")) return "basic";
  return null;
}

function pageFlags(page = "") {
  const p = String(page || "").toLowerCase();
  return {
    inCheckout: /billing|checkout|stripe/.test(p),
    onPricing: /pricing|billing|plans/.test(p),
    onSignup: /signup|register/.test(p),
    onDashboard: /dashboard|dialer|campaign/.test(p)
  };
}

function resolveVisitChannel(source) {
  const s = String(source || "").toLowerCase();
  if (["google", "bing", "yahoo", "duckduckgo"].some((x) => s.includes(x))) return "search";
  if (["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube", "meta"].some((x) => s.includes(x))) {
    return "social";
  }
  if (s === "direct") return "direct";
  if (s === "referral" || s.includes(".")) return "referral";
  if (s === "email" || s.includes("newsletter")) return "email";
  return "other";
}

function resolveVisitSource(row) {
  if (row.utmSource) return String(row.utmSource).toLowerCase();
  if (row.gclid) return "google";
  if (row.fbclid) return "facebook";
  if (row.msclkid) return "bing";
  if (row.ttclid) return "tiktok";
  if (row.sourceHint) return String(row.sourceHint).toLowerCase();
  const ref = String(row.referrer || "").trim();
  if (ref) {
    try {
      const host = new URL(ref).hostname.replace(/^www\./, "").toLowerCase();
      if (host && !host.includes("otodial.com") && host !== "localhost") return host;
    } catch {
      return "referral";
    }
  }
  return "direct";
}

async function aggregateTrafficSources(windowMatch) {
  const rows = await Analytics.aggregate([
    { $match: windowMatch },
    {
      $project: {
        utmSource: 1,
        gclid: 1,
        fbclid: 1,
        msclkid: 1,
        ttclid: 1,
        sourceHint: 1,
        referrer: 1,
        signedUp: 1,
        hasSubscription: 1
      }
    },
    {
      $addFields: {
        source: {
          $switch: {
            branches: [
              {
                case: { $and: [{ $ne: ["$utmSource", null] }, { $ne: ["$utmSource", ""] }] },
                then: { $toLower: "$utmSource" }
              },
              {
                case: { $and: [{ $ne: ["$gclid", null] }, { $ne: ["$gclid", ""] }] },
                then: "google"
              },
              {
                case: { $and: [{ $ne: ["$fbclid", null] }, { $ne: ["$fbclid", ""] }] },
                then: "facebook"
              },
              {
                case: { $and: [{ $ne: ["$msclkid", null] }, { $ne: ["$msclkid", ""] }] },
                then: "bing"
              },
              {
                case: { $and: [{ $ne: ["$ttclid", null] }, { $ne: ["$ttclid", ""] }] },
                then: "tiktok"
              },
              {
                case: { $and: [{ $ne: ["$sourceHint", null] }, { $ne: ["$sourceHint", ""] }] },
                then: { $toLower: "$sourceHint" }
              },
              {
                case: { $and: [{ $ne: ["$referrer", null] }, { $ne: ["$referrer", ""] }] },
                then: "referral"
              }
            ],
            default: "direct"
          }
        }
      }
    },
    {
      $group: {
        _id: "$source",
        visitors: { $sum: 1 },
        conversions: {
          $sum: { $cond: [{ $or: ["$signedUp", "$hasSubscription"] }, 1, 0] }
        }
      }
    },
    { $sort: { visitors: -1 } },
    { $limit: 20 }
  ]).option({ maxTimeMS: 15000 });

  return rows.map((r) => ({
    source: r._id || "direct",
    channel: resolveVisitChannel(r._id),
    visitors: r.visitors,
    conversions: r.conversions,
    revenue: 0
  }));
}

async function aggregateDeviceBreakdown(windowMatch) {
  const [devices, browsers, osRows] = await Promise.all([
    Analytics.aggregate([
      { $match: windowMatch },
      { $group: { _id: { $ifNull: ["$device", "unknown"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).option({ maxTimeMS: 12000 }),
    Analytics.aggregate([
      { $match: windowMatch },
      { $group: { _id: { $ifNull: ["$browser", "unknown"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 }
    ]).option({ maxTimeMS: 12000 }),
    Analytics.aggregate([
      { $match: windowMatch },
      { $group: { _id: { $ifNull: ["$os", "unknown"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 }
    ]).option({ maxTimeMS: 12000 })
  ]);
  return {
    devices: devices.map((d) => ({ device: d._id, count: d.count })),
    browsers: browsers.map((d) => ({ browser: d._id, count: d.count })),
    os: osRows.map((d) => ({ os: d._id, count: d.count })),
    languages: [],
    darkModePercent: 0
  };
}

async function aggregateGeoBreakdown(windowMatch) {
  const rows = await Analytics.aggregate([
    { $match: windowMatch },
    {
      $group: {
        _id: { country: { $ifNull: ["$country", "Unknown"] }, city: { $ifNull: ["$city", ""] } },
        visitors: { $sum: 1 },
        lat: { $first: "$latitude" },
        lng: { $first: "$longitude" },
        subscribers: { $sum: { $cond: ["$hasSubscription", 1, 0] } },
        signups: { $sum: { $cond: ["$signedUp", 1, 0] } }
      }
    },
    { $sort: { visitors: -1 } },
    { $limit: 80 }
  ]).option({ maxTimeMS: 15000 });

  return rows.map((r) => ({
    country: r._id.country,
    city: r._id.city || null,
    visitors: r.visitors,
    signups: r.signups,
    purchases: 0,
    lat: r.lat,
    lng: r.lng,
    returning: 0,
    subscribers: r.subscribers,
    revenue: 0,
    calls: 0,
    sms: 0,
    avgSessionSeconds: 0
  }));
}

async function countPlanTiersInWindow(windowMatch) {
  const userIdsInWindow = await Analytics.distinct("userId", {
    ...windowMatch,
    userId: { $ne: null }
  }).maxTimeMS(12000);
  if (!userIdsInWindow.length) {
    return { basic: 0, super: 0, unlimited: 0, enterprise: 0 };
  }
  const subs = await Subscription.find({ userId: { $in: userIdsInWindow }, status: "active" })
    .select("userId planKey planName")
    .lean();
  const seen = new Set();
  const counts = { basic: 0, super: 0, unlimited: 0, enterprise: 0 };
  for (const s of subs) {
    const uid = String(s.userId);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const tier = normalizePlanTier(s.planKey, s.planName);
    if (tier && Object.prototype.hasOwnProperty.call(counts, tier)) counts[tier] += 1;
  }
  return counts;
}

function buildWindowMatch(windowStart) {
  return {
    $or: [{ visitEnd: { $gte: windowStart } }, { visitStart: { $gte: windowStart } }]
  };
}

function pageIntentMatch(windowMatch, pattern) {
  const regex = new RegExp(pattern, "i");
  return {
    $and: [windowMatch, { $or: [{ page: regex }, { landingUrl: regex }] }]
  };
}

/**
 * Query legacy Analytics sessions for a rolling window (start → now).
 */
export async function queryLegacyRealtime({ start, end, label = "15m", tableLimit = 500 } = {}) {
  const windowStart = start instanceof Date ? start : new Date(Date.now() - 15 * 60 * 1000);
  const windowEnd = end instanceof Date ? end : new Date();
  const windowMatch = buildWindowMatch(windowStart);
  const activeNowThreshold = new Date(Date.now() - ACTIVE_NOW_MS);
  const activeNowMatch = {
    $and: [
      windowMatch,
      {
        $expr: {
          $gte: [{ $ifNull: ["$visitEnd", "$visitStart"] }, activeNowThreshold]
        }
      }
    ]
  };
  const conversionsMatch = {
    $and: [windowMatch, { $or: [{ signedUp: true }, { hasSubscription: true }] }]
  };
  const loggedInMatch = { $and: [windowMatch, { userId: { $ne: null } }] };

  const activeSubUserIds = await Subscription.distinct("userId", { status: "active" }).maxTimeMS(10000);
  const paidInWindowMatch =
    activeSubUserIds.length > 0
      ? { $and: [windowMatch, { userId: { $in: activeSubUserIds } }] }
      : null;

  const [
    totalUsers,
    activeNow,
    signedUpUsers,
    subscribedUsers,
    loggedIn,
    paidSubscribersOnline,
    visitorsInCheckout,
    visitorsOnPricing,
    visitorsOnSignup,
    visitorsOnDashboard,
    returningVisitors,
    avgAgg,
    trafficSources,
    deviceBreakdown,
    geoBreakdown,
    planTiers,
    sessions
  ] = await Promise.all([
    Analytics.countDocuments(windowMatch).maxTimeMS(12000),
    Analytics.countDocuments(activeNowMatch).maxTimeMS(12000),
    Analytics.countDocuments(conversionsMatch).maxTimeMS(12000),
    Analytics.countDocuments({ $and: [windowMatch, { hasSubscription: true }] }).maxTimeMS(12000),
    Analytics.countDocuments(loggedInMatch).maxTimeMS(12000),
    paidInWindowMatch
      ? Analytics.countDocuments(paidInWindowMatch).maxTimeMS(12000)
      : Promise.resolve(0),
    Analytics.countDocuments(pageIntentMatch(windowMatch, "billing|checkout|stripe")).maxTimeMS(12000),
    Analytics.countDocuments(pageIntentMatch(windowMatch, "pricing|billing|plans")).maxTimeMS(12000),
    Analytics.countDocuments(pageIntentMatch(windowMatch, "signup|register")).maxTimeMS(12000),
    Analytics.countDocuments(pageIntentMatch(windowMatch, "dashboard|dialer|campaign")).maxTimeMS(12000),
    Analytics.countDocuments({ $and: [windowMatch, { isReturning: true }] }).maxTimeMS(12000),
    Analytics.aggregate([
      { $match: windowMatch },
      { $group: { _id: null, avgTime: { $avg: "$timeSpent" }, totalTime: { $sum: "$timeSpent" } } }
    ]).option({ maxTimeMS: 12000 }),
    aggregateTrafficSources(windowMatch),
    aggregateDeviceBreakdown(windowMatch),
    aggregateGeoBreakdown(windowMatch),
    countPlanTiersInWindow(windowMatch),
    Analytics.find(windowMatch)
      .select(
        "sessionId userId ipAddress device browser os country countryCode city region latitude longitude timeSpent signedUp hasSubscription isReturning referrer userAgent page pageTitle landingUrl sourceHint utmSource utmMedium utmCampaign utmTerm utmContent gclid fbclid msclkid ttclid visitStart visitEnd createdAt"
      )
      .sort({ visitEnd: -1, visitStart: -1 })
      .limit(Math.min(500, Math.max(1, tableLimit)))
      .lean()
      .maxTimeMS(15000)
  ]);

  const userIds = [...new Set(sessions.map((r) => (r.userId ? String(r.userId) : null)).filter(Boolean))];

  const [users, subs] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds } })
          .select("_id email name firstName lastName remainingCredits role")
          .lean()
      : [],
    userIds.length
      ? Subscription.find({ userId: { $in: userIds }, status: "active" })
          .select("userId planName planKey status")
          .lean()
      : []
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const subMap = new Map(subs.map((s) => [String(s.userId), s]));
  const now = Date.now();

  const rows = sessions.map((row) => {
    const user = row.userId ? userMap.get(String(row.userId)) : null;
    const sub = row.userId ? subMap.get(String(row.userId)) : null;
    const lastActivity = row.visitEnd || row.visitStart || null;
    const lastMs = lastActivity ? new Date(lastActivity).getTime() : now;
    const startMs = row.visitStart ? new Date(row.visitStart).getTime() : lastMs;
    const idleSec = Math.max(0, Math.round((now - lastMs) / 1000));
    const durSec = Math.max(0, Math.round((lastMs - startMs) / 1000));
    const conversion = row.hasSubscription ? "subscription" : row.signedUp ? "signup" : "none";
    const page = row.page || row.landingUrl || "";
    const flags = pageFlags(page);

    let latitude = Number(row.latitude);
    let longitude = Number(row.longitude);
    if ((!Number.isFinite(latitude) || !Number.isFinite(longitude)) && row.ipAddress) {
      const geo = geoip.lookup(row.ipAddress);
      if (Array.isArray(geo?.ll)) {
        latitude = Number(geo.ll[0]);
        longitude = Number(geo.ll[1]);
      }
    }

    const planTier = normalizePlanTier(sub?.planKey, sub?.planName);
    const hasActiveSubscription = !!sub;
    const isSubscriber = hasActiveSubscription || !!row.hasSubscription;
    const source = resolveVisitSource(row);
    const channel = resolveVisitChannel(source);

    return {
      visitorId: row.sessionId,
      sessionId: row.sessionId,
      userId: row.userId ? String(row.userId) : null,
      userName: user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
      userEmail: user?.email || null,
      remainingCredits: Number(user?.remainingCredits || 0),
      isAdmin: user?.role === "admin",
      currentPage: page,
      pageTitle: row.pageTitle || null,
      previousPage: null,
      currentUrl: page,
      pagesViewed: Math.max(1, Math.round(Number(row.timeSpent || 0) / 45) || 1),
      sessionDurationSeconds: Number(row.timeSpent) > 0 ? Number(row.timeSpent) : durSec,
      idleSeconds: idleSec,
      liveStatus: idleSec <= 90 ? "active" : "idle",
      isActiveNow: lastMs >= now - ACTIVE_NOW_MS,
      country: row.country && row.country !== "Unknown" ? row.country : (row.countryCode || "—"),
      city: row.city || null,
      region: row.region || null,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      device: row.device || "—",
      browser: row.browser || "—",
      os: row.os || "—",
      channel,
      source,
      utmSource: row.utmSource || null,
      utmMedium: row.utmMedium || null,
      utmCampaign: row.utmCampaign || null,
      utmTerm: row.utmTerm || null,
      utmContent: row.utmContent || null,
      referrer: row.referrer || "",
      ipAddress: row.ipAddress || null,
      landingPage: row.landingUrl || page,
      sessionStartedAt: row.visitStart,
      lastActivityAt: lastActivity,
      isReturning: !!row.isReturning,
      isNew: !row.isReturning,
      isSubscriber,
      hasActiveSubscription,
      signedUp: !!row.signedUp || conversion !== "none",
      conversion,
      subscriptionStatus: sub?.status || null,
      subscriptionPlan: sub?.planName || sub?.planKey || null,
      planTier,
      flags,
      pageHistory: [],
      timeline: [],
      events: []
    };
  });

  const summary = {
    windowKey: label,
    totalUsers,
    activeNow,
    signedUpUsers,
    subscribedUsers,
    paidSubscribersOnline,
    loggedIn,
    anonymous: Math.max(0, totalUsers - loggedIn),
    returningVisitors,
    newVisitors: Math.max(0, totalUsers - returningVisitors),
    visitorsInCheckout,
    visitorsOnPricing,
    visitorsOnSignup,
    visitorsOnDashboard,
    basicUsersOnline: planTiers.basic,
    superUsersOnline: planTiers.super,
    unlimitedUsersOnline: planTiers.unlimited,
    enterpriseUsersOnline: planTiers.enterprise,
    totalTimeSpent: Math.round(Number(avgAgg[0]?.totalTime || 0)),
    avgSessionSeconds: Math.round(Number(avgAgg[0]?.avgTime || 0)),
    avgPagesViewed: 1,
    tableRowsLoaded: rows.length,
    tableRowsTotal: totalUsers
  };

  return { summary, rows, trafficSources, deviceBreakdown, geoBreakdown, windowStart, windowEnd };
}

/**
 * Map legacy realtime summary to live KPI strip fields.
 */
export function legacySummaryToKpis(summary, telecom = {}) {
  const totalUsers = summary.totalUsers || 0;
  const signups = telecom.signups ?? summary.signedUpUsers ?? 0;
  return {
    activeVisitors: totalUsers,
    activeNow: summary.activeNow || 0,
    activeLoggedIn: summary.loggedIn || 0,
    anonymousVisitors: summary.anonymous || 0,
    returningVisitors: summary.returningVisitors || 0,
    newVisitors: summary.newVisitors || totalUsers,
    subscribersOnline: summary.subscribedUsers || 0,
    paidSubscribersOnline: summary.paidSubscribersOnline || 0,
    basicUsersOnline: summary.basicUsersOnline || 0,
    superUsersOnline: summary.superUsersOnline || 0,
    unlimitedUsersOnline: summary.unlimitedUsersOnline || 0,
    enterpriseUsersOnline: summary.enterpriseUsersOnline || 0,
    visitorsInCheckout: summary.visitorsInCheckout || 0,
    visitorsOnPricing: summary.visitorsOnPricing || 0,
    visitorsOnSignup: summary.visitorsOnSignup || 0,
    visitorsOnDashboard: summary.visitorsOnDashboard || 0,
    liveCalls: telecom.calls ?? 0,
    liveSms: telecom.sms ?? 0,
    livePurchases: telecom.purchases ?? 0,
    liveRevenueWindow: telecom.revenue ?? 0,
    liveSignups: signups,
    avgSessionSeconds: summary.avgSessionSeconds || 0,
    avgActiveSeconds: summary.avgSessionSeconds || 0,
    avgPagesViewed: summary.avgPagesViewed || 0,
    bounceRisk: 0,
    liveConversionRate:
      totalUsers > 0 ? Number(((signups / totalUsers) * 100).toFixed(2)) : 0,
    sessionsInWindow: totalUsers
  };
}

export default { queryLegacyRealtime, legacySummaryToKpis };
