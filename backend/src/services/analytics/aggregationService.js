import AnalyticsSession from "../../models/analytics/AnalyticsSession.js";
import AnalyticsPageView from "../../models/analytics/AnalyticsPageView.js";
import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";
import AnalyticsVisitor from "../../models/analytics/AnalyticsVisitor.js";
import AnalyticsDailyRollup from "../../models/analytics/AnalyticsDailyRollup.js";
import User from "../../models/User.js";
import StripeInvoice from "../../models/StripeInvoice.js";
import Subscription from "../../models/Subscription.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import { getCachedJson, setCachedJson, deleteCachedKey } from "../cache.service.js";
import { toUtcDayKey } from "./rollupService.js";
import { resolveRange, resolveComparison } from "./rangeService.js";
import { runReconciliation } from "./reconciliationService.js";
import { markAnalyticsSyncSuccess } from "./analyticsHealthService.js";
import { ANALYTICS_EVENTS } from "../../constants/analyticsEvents.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 45;

function floorUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function ceilUtcDay(date) {
  const floored = floorUtcDay(date);
  return floored.getTime() === new Date(date).getTime()
    ? floored
    : new Date(floored.getTime() + DAY_MS);
}

function mergeCountMaps(target, source) {
  if (!source) return target;
  for (const [key, val] of Object.entries(source)) {
    target[key] = (target[key] || 0) + (Number(val) || 0);
  }
  return target;
}

function mapToSortedArray(map, keyName, limit = 0) {
  const arr = Object.entries(map || {})
    .map(([key, count]) => ({ [keyName]: key, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count);
  return limit > 0 ? arr.slice(0, limit) : arr;
}

/**
 * Collect additive metrics + breakdown maps + a per-day series across a range
 * by combining pre-aggregated rollups (complete UTC days) with raw queries for
 * partial/current-day edges.
 */
async function collectAdditive(start, end) {
  const now = new Date();
  const firstFullDayStart = ceilUtcDay(start);
  const todayUtcStart = floorUtcDay(now);
  const rollupEndExclusive = new Date(
    Math.min(floorUtcDay(end).getTime(), todayUtcStart.getTime())
  );
  const hasRollups = firstFullDayStart.getTime() < rollupEndExclusive.getTime();

  const rawIntervals = [];
  if (!hasRollups) {
    rawIntervals.push([start, end]);
  } else {
    if (start.getTime() < firstFullDayStart.getTime()) {
      rawIntervals.push([start, firstFullDayStart]);
    }
    if (rollupEndExclusive.getTime() < end.getTime()) {
      rawIntervals.push([rollupEndExclusive, end]);
    }
  }

  const additive = {
    sessions: 0,
    pageViews: 0,
    bounces: 0,
    totalDurationSeconds: 0
  };
  const maps = {
    byChannel: {},
    byCountry: {},
    byDevice: {},
    byBrowser: {},
    byOS: {},
    byPage: {},
    bySource: {},
    eventCounts: {}
  };
  const daily = new Map(); // dayKey -> metrics

  function ensureDay(dayKey) {
    if (!daily.has(dayKey)) {
      daily.set(dayKey, {
        date: dayKey,
        visitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        sessions: 0,
        pageViews: 0,
        signups: 0,
        subscriptions: 0,
        revenue: 0
      });
    }
    return daily.get(dayKey);
  }

  // --- Rollups (complete days) ---
  if (hasRollups) {
    const fromKey = toUtcDayKey(firstFullDayStart);
    const toKey = toUtcDayKey(new Date(rollupEndExclusive.getTime() - 1));
    const rollups = await AnalyticsDailyRollup.find({
      date: { $gte: fromKey, $lte: toKey }
    }).lean();

    for (const r of rollups) {
      const m = r.metrics || {};
      additive.sessions += m.sessions || 0;
      additive.pageViews += m.pageViews || 0;
      additive.bounces += m.bounces || 0;
      additive.totalDurationSeconds += m.totalDurationSeconds || 0;
      mergeCountMaps(maps.byChannel, r.byChannel);
      mergeCountMaps(maps.byCountry, r.byCountry);
      mergeCountMaps(maps.byDevice, r.byDevice);
      mergeCountMaps(maps.byBrowser, r.byBrowser);
      mergeCountMaps(maps.byOS, r.byOS);
      mergeCountMaps(maps.byPage, r.byPage);
      mergeCountMaps(maps.bySource, r.bySource);
      mergeCountMaps(maps.eventCounts, r.eventCounts);

      const day = ensureDay(r.date);
      day.visitors += m.visitors || 0;
      day.newVisitors += m.newVisitors || 0;
      day.returningVisitors += m.returningVisitors || 0;
      day.sessions += m.sessions || 0;
      day.pageViews += m.pageViews || 0;
      day.signups += m.signups || 0;
      day.subscriptions += m.subscriptions || 0;
      day.revenue += m.revenue || 0;
    }
  }

  // --- Raw partial intervals ---
  for (const [rs, re] of rawIntervals) {
    const sessionMatch = { startedAt: { $gte: rs, $lt: re } };
    const pvMatch = { timestamp: { $gte: rs, $lt: re } };
    const eventMatch = { timestamp: { $gte: rs, $lt: re } };

    const [
      sessAgg,
      channelAgg,
      countryAgg,
      deviceAgg,
      browserAgg,
      osAgg,
      sourceAgg,
      sessDaily,
      pvCount,
      pageAgg,
      pvDaily,
      eventAgg,
      eventDaily
    ] = await Promise.all([
      AnalyticsSession.aggregate([
        { $match: sessionMatch },
        {
          $group: {
            _id: null,
            sessions: { $sum: 1 },
            bounces: { $sum: { $cond: ["$isBounce", 1, 0] } },
            totalDurationSeconds: { $sum: "$durationSeconds" }
          }
        }
      ]),
      AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: "$channel", count: { $sum: 1 } } }]),
      AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: "$country", count: { $sum: 1 } } }]),
      AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: "$device", count: { $sum: 1 } } }]),
      AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: "$browser", count: { $sum: 1 } } }]),
      AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: "$os", count: { $sum: 1 } } }]),
      AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: "$source", count: { $sum: 1 } } }]),
      AnalyticsSession.aggregate([
        { $match: sessionMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt" } },
            sessions: { $sum: 1 },
            newVisitors: { $sum: { $cond: ["$isReturning", 0, 1] } },
            returningVisitors: { $sum: { $cond: ["$isReturning", 1, 0] } }
          }
        }
      ]),
      AnalyticsPageView.countDocuments(pvMatch),
      AnalyticsPageView.aggregate([
        { $match: pvMatch },
        { $group: { _id: "$page", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 100 }
      ]),
      AnalyticsPageView.aggregate([
        { $match: pvMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            pageViews: { $sum: 1 }
          }
        }
      ]),
      AnalyticsEvent.aggregate([
        { $match: eventMatch },
        { $group: { _id: "$name", count: { $sum: 1 }, value: { $sum: "$value" } } }
      ]),
      AnalyticsEvent.aggregate([
        { $match: eventMatch },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
              name: "$name"
            },
            count: { $sum: 1 },
            value: { $sum: "$value" }
          }
        }
      ])
    ]);

    const s = sessAgg[0] || { sessions: 0, bounces: 0, totalDurationSeconds: 0 };
    additive.sessions += s.sessions;
    additive.bounces += s.bounces;
    additive.totalDurationSeconds += s.totalDurationSeconds;
    additive.pageViews += pvCount;

    for (const row of channelAgg) mergeCountMaps(maps.byChannel, { [row._id]: row.count });
    for (const row of countryAgg) mergeCountMaps(maps.byCountry, { [row._id]: row.count });
    for (const row of deviceAgg) mergeCountMaps(maps.byDevice, { [row._id]: row.count });
    for (const row of browserAgg) mergeCountMaps(maps.byBrowser, { [row._id]: row.count });
    for (const row of osAgg) mergeCountMaps(maps.byOS, { [row._id]: row.count });
    for (const row of sourceAgg) mergeCountMaps(maps.bySource, { [row._id]: row.count });
    for (const row of pageAgg) mergeCountMaps(maps.byPage, { [row._id]: row.count });
    for (const row of eventAgg) mergeCountMaps(maps.eventCounts, { [row._id]: row.count });

    for (const row of sessDaily) {
      const day = ensureDay(row._id);
      day.sessions += row.sessions;
      day.visitors += row.sessions;
      day.newVisitors += row.newVisitors;
      day.returningVisitors += row.returningVisitors;
    }
    for (const row of pvDaily) ensureDay(row._id).pageViews += row.pageViews;
    for (const row of eventDaily) {
      const day = ensureDay(row._id.day);
      if (row._id.name === ANALYTICS_EVENTS.SIGNUP_COMPLETED) day.signups += row.count;
      if (
        row._id.name === ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED ||
        row._id.name === ANALYTICS_EVENTS.PURCHASE
      ) {
        day.subscriptions += row.count;
        day.revenue += row.value || 0;
      }
    }
  }

  return { additive, maps, daily };
}

/** Trustworthy headline metrics sourced from canonical collections. */
async function collectCoreAccurate(start, end) {
  const [uniqueVisitorIds, newVisitors, signUps, revenueAgg, totalUsersAllTime, paidSubscribers, callsInRange, smsInRange, numbersInRange] =
    await Promise.all([
    AnalyticsSession.distinct("visitorId", { startedAt: { $gte: start, $lte: end } }),
    AnalyticsVisitor.countDocuments({ firstSeenAt: { $gte: start, $lte: end } }),
    User.countDocuments({ createdAt: { $gte: start, $lte: end }, role: { $ne: "admin" } }),
    StripeInvoice.aggregate([
      {
        $match: {
          status: "paid",
          $or: [
            { purchaseType: "subscription" },
            { purchaseType: "unknown", subscriptionId: { $ne: null } }
          ]
        }
      },
      { $addFields: { effectiveIssuedAt: { $ifNull: ["$issuedAt", "$createdAt"] } } },
      { $match: { effectiveIssuedAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$amountPaid" },
          conversions: { $addToSet: { $ifNull: [{ $toString: "$userId" }, "$customerId"] } }
        }
      }
    ]),
    User.countDocuments({ role: { $ne: "admin" } }),
    Subscription.countDocuments({ status: "active" }),
    Call.countDocuments({ createdAt: { $gte: start, $lte: end } }),
    SMS.countDocuments({ createdAt: { $gte: start, $lte: end }, direction: "outbound" }),
    PhoneNumber.countDocuments({
      $or: [
        { purchaseDate: { $gte: start, $lte: end } },
        { purchaseDate: null, createdAt: { $gte: start, $lte: end } }
      ]
    })
  ]);

  const uniqueVisitors = uniqueVisitorIds.length;
  const revenueRow = revenueAgg[0] || { revenue: 0, conversions: [] };
  return {
    uniqueVisitors,
    newVisitors,
    returningVisitors: Math.max(0, uniqueVisitors - newVisitors),
    signUps,
    revenue: Number((revenueRow.revenue || 0).toFixed(2)),
    subscriptionConversions: (revenueRow.conversions || []).filter(
      (k) => k && k !== "unknown"
    ).length,
    totalUsersAllTime,
    paidSubscribers,
    callsInRange,
    smsInRange,
    numbersInRange
  };
}

function buildOverview(additive, core) {
  const sessions = additive.sessions || 0;
  const pageViews = additive.pageViews || 0;
  const bounces = additive.bounces || 0;
  const duration = additive.totalDurationSeconds || 0;
  return {
    totalVisitors: sessions, // total sessions (page visits proxy)
    uniqueVisitors: core.uniqueVisitors,
    newVisitors: core.newVisitors,
    returningVisitors: core.returningVisitors,
    sessions,
    pageViews,
    pagesPerSession: sessions > 0 ? Number((pageViews / sessions).toFixed(2)) : 0,
    bounceRate: sessions > 0 ? Number(((bounces / sessions) * 100).toFixed(2)) : 0,
    avgSessionDuration: sessions > 0 ? Math.round(duration / sessions) : 0,
    avgTimeSpent: sessions > 0 ? Math.round(duration / sessions) : 0,
    signUps: core.signUps,
    usersWithSubscription: core.subscriptionConversions,
    paidSubscribers: core.paidSubscribers,
    totalUsersAllTime: core.totalUsersAllTime,
    callsInRange: core.callsInRange,
    smsInRange: core.smsInRange,
    numbersInRange: core.numbersInRange,
    revenue: core.revenue,
    arpu: core.uniqueVisitors > 0 ? Number((core.revenue / core.uniqueVisitors).toFixed(2)) : 0,
    signupConversionRate:
      core.uniqueVisitors > 0
        ? Number(((core.signUps / core.uniqueVisitors) * 100).toFixed(2))
        : 0,
    subscriptionConversionRate:
      core.signUps > 0
        ? Number(((core.subscriptionConversions / core.signUps) * 100).toFixed(2))
        : 0
  };
}

async function buildComparison(start, end, compare) {
  const window = resolveComparison({ start, end }, compare);
  if (!window) return null;
  const [{ additive }, core] = await Promise.all([
    collectAdditive(window.start, window.end),
    collectCoreAccurate(window.start, window.end)
  ]);
  const overview = buildOverview(additive, core);
  return { mode: window.mode, range: { start: window.start, end: window.end }, overview };
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/** Traffic sources with conversion data (single aggregation over sessions). */
async function buildTrafficSources(start, end) {
  const rows = await AnalyticsSession.aggregate([
    { $match: { startedAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { channel: "$channel", source: "$source", socialPlatform: "$socialPlatform" },
        visits: { $sum: 1 },
        uniqueVisitors: { $addToSet: "$visitorId" },
        signUps: { $sum: { $cond: ["$signedUp", 1, 0] } },
        subscriptions: { $sum: { $cond: ["$hasSubscription", 1, 0] } },
        influencers: { $addToSet: "$influencerHandle" }
      }
    },
    { $sort: { visits: -1 } },
    { $limit: 100 }
  ]);

  const channelMap = new Map();
  const topSources = rows.map((r) => {
    const unique = (r.uniqueVisitors || []).length;
    const channel = r._id.channel || "direct";
    const ch = channelMap.get(channel) || { channel, visits: 0, signUps: 0, subscriptions: 0 };
    ch.visits += r.visits;
    ch.signUps += r.signUps;
    ch.subscriptions += r.subscriptions;
    channelMap.set(channel, ch);
    return {
      source: r._id.source || "direct",
      channel,
      socialPlatform: r._id.socialPlatform || null,
      visits: r.visits,
      uniqueVisitors: unique,
      signUps: r.signUps,
      subscriptions: r.subscriptions,
      conversionRate: unique > 0 ? Number(((r.signUps / unique) * 100).toFixed(2)) : 0,
      influencers: (r.influencers || []).filter(Boolean).slice(0, 5)
    };
  });

  const channels = Array.from(channelMap.values())
    .map((c) => ({
      ...c,
      conversionRate: c.visits > 0 ? Number(((c.signUps / c.visits) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.visits - a.visits);

  return { channels, topSources: topSources.slice(0, 25) };
}

/** Revenue analytics from Stripe invoices (source of truth). */
async function buildRevenue(start, end) {
  const [byDay, byPlan, totals] = await Promise.all([
    StripeInvoice.aggregate([
      { $match: { status: "paid" } },
      { $addFields: { ts: { $ifNull: ["$issuedAt", "$createdAt"] } } },
      { $match: { ts: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } },
          revenue: { $sum: "$amountPaid" },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    StripeInvoice.aggregate([
      { $match: { status: "paid" } },
      { $addFields: { ts: { $ifNull: ["$issuedAt", "$createdAt"] } } },
      { $match: { ts: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$purchaseType",
          revenue: { $sum: "$amountPaid" },
          orders: { $sum: 1 }
        }
      }
    ]),
    StripeInvoice.aggregate([
      { $match: { status: "paid" } },
      { $addFields: { ts: { $ifNull: ["$issuedAt", "$createdAt"] } } },
      { $match: { ts: { $gte: start, $lte: end } } },
      { $group: { _id: null, revenue: { $sum: "$amountPaid" }, orders: { $sum: 1 } } }
    ])
  ]);

  const total = totals[0] || { revenue: 0, orders: 0 };
  return {
    byDay: byDay.map((r) => ({ date: r._id, revenue: Number((r.revenue || 0).toFixed(2)), orders: r.orders })),
    byPlan: byPlan.map((r) => ({ plan: r._id || "unknown", revenue: Number((r.revenue || 0).toFixed(2)), orders: r.orders })),
    totalRevenue: Number((total.revenue || 0).toFixed(2)),
    orders: total.orders,
    averageOrderValue: total.orders > 0 ? Number((total.revenue / total.orders).toFixed(2)) : 0
  };
}

/** Subscription lifecycle snapshot. */
async function buildSubscriptions(start, end) {
  const [statusAgg, newInRange] = await Promise.all([
    Subscription.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Subscription.countDocuments({ createdAt: { $gte: start, $lte: end } })
  ]);
  const byStatus = {};
  let total = 0;
  for (const row of statusAgg) {
    byStatus[row._id || "unknown"] = row.count;
    total += row.count;
  }
  return {
    total,
    active: byStatus.active || 0,
    suspended: byStatus.suspended || 0,
    cancelled: byStatus.cancelled || 0,
    expired: byStatus.expired || 0,
    newInRange,
    byStatus
  };
}

async function buildActiveUsers() {
  const now = Date.now();
  const [dau, wau, mau] = await Promise.all([
    AnalyticsSession.distinct("visitorId", { lastActivityAt: { $gte: new Date(now - DAY_MS) } }),
    AnalyticsSession.distinct("visitorId", { lastActivityAt: { $gte: new Date(now - 7 * DAY_MS) } }),
    AnalyticsSession.distinct("visitorId", { lastActivityAt: { $gte: new Date(now - 30 * DAY_MS) } })
  ]);
  return { dau: dau.length, wau: wau.length, mau: mau.length };
}

function buildFunnel(overview, maps, core = {}) {
  const events = maps.eventCounts || {};
  return {
    visitors: overview.uniqueVisitors,
    signedUp: overview.signUps,
    emailVerified: events[ANALYTICS_EVENTS.EMAIL_VERIFIED] || 0,
    subscribed: overview.usersWithSubscription,
    numberPurchased: core.numbersInRange ?? (events[ANALYTICS_EVENTS.NUMBER_PURCHASED] || 0),
    firstCall:
      core.callsInRange ??
      ((events[ANALYTICS_EVENTS.FIRST_CALL] || 0) ||
      (events[ANALYTICS_EVENTS.CALL_COMPLETED] || 0)),
    signupConversionRate:
      overview.uniqueVisitors > 0
        ? Number(((overview.signUps / overview.uniqueVisitors) * 100).toFixed(2))
        : 0,
    subscriptionConversionRate:
      overview.signUps > 0
        ? Number(((overview.usersWithSubscription / overview.signUps) * 100).toFixed(2))
        : 0
  };
}

function dashboardCacheKey(params) {
  return `analytics:dashboard:${JSON.stringify(params)}`;
}

/**
 * Build the full enterprise dashboard payload. Each section is resolved
 * independently so a single failure degrades gracefully (partial dashboard).
 */
export async function getDashboard(query = {}) {
  const queryStarted = Date.now();
  const range = resolveRange(query);
  const compare = query.compare || "previous_period";
  const cacheParams = {
    range: range.label,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    compare
  };
  const cacheKey = dashboardCacheKey(cacheParams);

  let cacheHit = false;
  if (!query.noCache) {
    const cached = await getCachedJson(cacheKey);
    if (cached) {
      cacheHit = true;
      return {
        ...cached,
        meta: {
          ...cached.meta,
          cached: true,
          cacheHit: true,
          queryDurationMs: Date.now() - queryStarted
        }
      };
    }
  }

  const { start, end } = range;

  const sections = await Promise.allSettled([
    collectAdditive(start, end), // 0
    collectCoreAccurate(start, end), // 1
    buildTrafficSources(start, end), // 2
    buildRevenue(start, end), // 3
    buildSubscriptions(start, end), // 4
    buildActiveUsers(), // 5
    buildComparison(start, end, compare) // 6
  ]);

  const errors = {};
  const additive =
    sections[0].status === "fulfilled" ? sections[0].value.additive : { sessions: 0, pageViews: 0, bounces: 0, totalDurationSeconds: 0 };
  const maps =
    sections[0].status === "fulfilled" ? sections[0].value.maps : { byChannel: {}, byCountry: {}, byDevice: {}, byBrowser: {}, byOS: {}, byPage: {}, bySource: {}, eventCounts: {} };
  const dailyMap = sections[0].status === "fulfilled" ? sections[0].value.daily : new Map();
  if (sections[0].status === "rejected") errors.timeseries = String(sections[0].reason);

  const core =
    sections[1].status === "fulfilled"
      ? sections[1].value
      : {
        uniqueVisitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        signUps: 0,
        revenue: 0,
        subscriptionConversions: 0,
        totalUsersAllTime: 0,
        paidSubscribers: 0,
        callsInRange: 0,
        smsInRange: 0,
        numbersInRange: 0
      };
  if (sections[1].status === "rejected") errors.core = String(sections[1].reason);

  const overview = buildOverview(additive, core);

  const dailyVisitors = Array.from(dailyMap.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1
  );

  const countries = mapToSortedArray(maps.byCountry, "country", 50).map((c) => ({
    country: c.country,
    countryCode: c.country,
    visits: c.count
  }));
  const devices = mapToSortedArray(maps.byDevice, "device");
  const browsers = mapToSortedArray(maps.byBrowser, "browser", 12);
  const os = mapToSortedArray(maps.byOS, "os", 12);
  const pages = mapToSortedArray(maps.byPage, "page", 25).map((p) => ({
    page: p.page,
    visits: p.count
  }));

  const topEvents = mapToSortedArray(maps.eventCounts, "name", 30);

  const trafficSources =
    sections[2].status === "fulfilled" ? sections[2].value : { channels: [], topSources: [] };
  if (sections[2].status === "rejected") errors.trafficSources = String(sections[2].reason);

  const revenue = sections[3].status === "fulfilled" ? sections[3].value : null;
  if (sections[3].status === "rejected") errors.revenue = String(sections[3].reason);

  const subscriptions = sections[4].status === "fulfilled" ? sections[4].value : null;
  if (sections[4].status === "rejected") errors.subscriptions = String(sections[4].reason);

  const activeUsers = sections[5].status === "fulfilled" ? sections[5].value : { dau: 0, wau: 0, mau: 0 };
  if (sections[5].status === "rejected") errors.activeUsers = String(sections[5].reason);

  const comparison = sections[6].status === "fulfilled" ? sections[6].value : null;
  if (sections[6].status === "rejected") errors.comparison = String(sections[6].reason);

  // Comparison deltas for headline KPIs.
  let deltas = null;
  if (comparison?.overview) {
    const prev = comparison.overview;
    deltas = {
      totalVisitors: pctChange(overview.totalVisitors, prev.totalVisitors),
      uniqueVisitors: pctChange(overview.uniqueVisitors, prev.uniqueVisitors),
      newVisitors: pctChange(overview.newVisitors, prev.newVisitors),
      returningVisitors: pctChange(overview.returningVisitors, prev.returningVisitors),
      sessions: pctChange(overview.sessions, prev.sessions),
      pageViews: pctChange(overview.pageViews, prev.pageViews),
      signUps: pctChange(overview.signUps, prev.signUps),
      usersWithSubscription: pctChange(overview.usersWithSubscription, prev.usersWithSubscription),
      revenue: pctChange(overview.revenue, prev.revenue),
      bounceRate: pctChange(overview.bounceRate, prev.bounceRate),
      avgSessionDuration: pctChange(overview.avgSessionDuration, prev.avgSessionDuration)
    };
  }

  const funnel = buildFunnel(overview, maps, core);

  const dbQueryMs = Date.now() - queryStarted;
  const reconciliation = await runReconciliation({
    start,
    end,
    overview,
    revenue,
    subscriptions
  }).catch((e) => ({
    healthy: false,
    error: e?.message,
    checks: [],
    warnings: []
  }));

  markAnalyticsSyncSuccess(dbQueryMs);

  const payload = {
    overview: { ...overview, dau: activeUsers.dau, wau: activeUsers.wau, mau: activeUsers.mau },
    deltas,
    comparison,
    dailyVisitors,
    countries,
    devices,
    browsers,
    os,
    pages,
    trafficSources,
    funnel,
    revenue,
    subscriptions,
    activeUsers,
    topEvents,
    reconciliation,
    meta: {
      source: "internal_v2",
      cached: false,
      cacheHit,
      range: { startDate: start.toISOString(), endDate: end.toISOString(), label: range.label },
      compare,
      errors: Object.keys(errors).length ? errors : null,
      generatedAt: new Date().toISOString(),
      queryDurationMs: dbQueryMs,
      recordsProcessed: {
        sessions: overview.sessions,
        pageViews: overview.pageViews,
        uniqueVisitors: overview.uniqueVisitors
      }
    }
  };

  if (!query.noCache) {
    await setCachedJson(cacheKey, payload, CACHE_TTL_SECONDS).catch(() => {});
  }
  return payload;
}

/**
 * Recompute dashboard overview using the same pipeline as getDashboard().
 * Used by reconciliation when no snapshot is passed (e.g. health panel).
 */
export async function buildReconciliationMetrics(start, end) {
  const [additiveResult, core] = await Promise.all([
    collectAdditive(start, end),
    collectCoreAccurate(start, end)
  ]);
  return {
    overview: buildOverview(additiveResult.additive, core),
    core,
    additive: additiveResult.additive
  };
}

/** Invalidate cached dashboards (used by manual refresh). */
export async function invalidateDashboardCache(query = {}) {
  const range = resolveRange(query);
  const compare = query.compare || "previous_period";
  const cacheKey = dashboardCacheKey({
    range: range.label,
    start: range.start.toISOString(),
    end: range.end.toISOString(),
    compare
  });
  await deleteCachedKey(cacheKey).catch(() => {});
}

export default { getDashboard, invalidateDashboardCache };
