import AnalyticsSession from "../../models/analytics/AnalyticsSession.js";
import AnalyticsPageView from "../../models/analytics/AnalyticsPageView.js";
import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";
import AnalyticsDailyRollup from "../../models/analytics/AnalyticsDailyRollup.js";
import {
  SIGNUP_EVENTS,
  REVENUE_EVENTS,
  SUBSCRIPTION_EVENTS
} from "../../constants/analyticsEvents.js";
import { countReturningInRange } from "./visitorClassificationService.js";

/** Format a Date to a UTC day key, e.g. "2026-06-26". */
export function toUtcDayKey(date) {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

export function utcDayBounds(dayKeyOrDate) {
  const key =
    typeof dayKeyOrDate === "string" ? dayKeyOrDate : toUtcDayKey(dayKeyOrDate);
  const [y, m, d] = key.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
  return { key, start, end };
}

function arrayToCountMap(rows, keyField = "_id", countField = "count") {
  const out = {};
  for (const row of rows || []) {
    const key = row?.[keyField];
    if (key === null || key === undefined || key === "") continue;
    out[String(key)] = row[countField] || 0;
  }
  return out;
}

/**
 * Compute (and upsert) the rollup document for a single UTC day.
 */
export async function computeRollupForDay(dayKeyOrDate) {
  const { key, start, end } = utcDayBounds(dayKeyOrDate);
  const sessionMatch = { startedAt: { $gte: start, $lt: end } };
  const pvMatch = { timestamp: { $gte: start, $lt: end } };
  const eventMatch = { timestamp: { $gte: start, $lt: end } };

  const [
    sessionFacet,
    visitorCounts,
    channelAgg,
    countryAgg,
    deviceAgg,
    browserAgg,
    osAgg,
    sourceAgg,
    pageViewCount,
    pageAgg,
    eventAgg
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
    countReturningInRange(start, new Date(end.getTime() - 1)),
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: "$channel", count: { $sum: 1 } } }
    ]),
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: "$country", count: { $sum: 1 } } }
    ]),
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: "$device", count: { $sum: 1 } } }
    ]),
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: "$browser", count: { $sum: 1 } } }
    ]),
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: "$os", count: { $sum: 1 } } }
    ]),
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
      { $group: { _id: "$source", count: { $sum: 1 } } }
    ]),
    AnalyticsPageView.countDocuments(pvMatch),
    AnalyticsPageView.aggregate([
      { $match: pvMatch },
      { $group: { _id: "$page", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 100 }
    ]),
    AnalyticsEvent.aggregate([
      { $match: eventMatch },
      {
        $group: {
          _id: "$name",
          count: { $sum: 1 },
          value: { $sum: "$value" }
        }
      }
    ])
  ]);

  const uniqueVisitors = visitorCounts.uniqueVisitors;
  const newVisitors = visitorCounts.newVisitors;
  const returningVisitors = visitorCounts.returningVisitors;
  const sessionStats = sessionFacet[0] || {
    sessions: 0,
    bounces: 0,
    totalDurationSeconds: 0
  };

  let signups = 0;
  let subscriptions = 0;
  let revenue = 0;
  const eventCounts = {};
  for (const row of eventAgg) {
    const name = row._id;
    if (!name) continue;
    eventCounts[name] = row.count || 0;
    if (SIGNUP_EVENTS.has(name)) signups += row.count || 0;
    if (REVENUE_EVENTS.has(name)) revenue += row.value || 0;
    if (SUBSCRIPTION_EVENTS.has(name)) subscriptions += row.count || 0;
  }

  const doc = {
    date: key,
    metrics: {
      visitors: uniqueVisitors,
      uniqueVisitors,
      newVisitors,
      returningVisitors,
      sessions: sessionStats.sessions,
      pageViews: pageViewCount,
      bounces: sessionStats.bounces,
      totalDurationSeconds: sessionStats.totalDurationSeconds,
      signups,
      subscriptions,
      revenue: Number(revenue.toFixed(2))
    },
    byChannel: arrayToCountMap(channelAgg),
    byCountry: arrayToCountMap(countryAgg),
    byDevice: arrayToCountMap(deviceAgg),
    byBrowser: arrayToCountMap(browserAgg),
    byOS: arrayToCountMap(osAgg),
    bySource: arrayToCountMap(sourceAgg),
    byPage: arrayToCountMap(pageAgg),
    eventCounts,
    computedAt: new Date()
  };

  await AnalyticsDailyRollup.updateOne({ date: key }, { $set: doc }, { upsert: true });
  return doc;
}

/**
 * Recompute the most recent N days (inclusive of today).
 */
export async function computeRecentRollups(days = 2) {
  const results = [];
  const today = new Date();
  for (let i = 0; i < Math.max(1, days); i += 1) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line no-await-in-loop
    results.push(await computeRollupForDay(d));
  }
  return results;
}

/**
 * Backfill rollups for every day from the earliest session to today.
 */
export async function backfillRollups({ onProgress } = {}) {
  const earliest = await AnalyticsSession.findOne({})
    .sort({ startedAt: 1 })
    .select("startedAt")
    .lean();
  if (!earliest) return { days: 0 };

  const startKey = toUtcDayKey(earliest.startedAt);
  const { start } = utcDayBounds(startKey);
  const todayEnd = utcDayBounds(new Date()).end;

  let cursor = new Date(start);
  let count = 0;
  while (cursor < todayEnd) {
    // eslint-disable-next-line no-await-in-loop
    await computeRollupForDay(cursor);
    count += 1;
    if (typeof onProgress === "function") onProgress(toUtcDayKey(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return { days: count };
}

let rollupTimer = null;

/** Periodic worker: refresh today + yesterday rollups. */
export function startRollupWorker({ intervalMs = 30 * 60 * 1000 } = {}) {
  if (rollupTimer) return;
  const run = () => {
    computeRecentRollups(2).catch((e) =>
      console.warn("[analytics] rollup worker error:", e?.message || e)
    );
  };
  // Initial run shortly after boot.
  setTimeout(run, 15_000).unref?.();
  rollupTimer = setInterval(run, intervalMs);
  rollupTimer.unref?.();
}

export default {
  toUtcDayKey,
  utcDayBounds,
  computeRollupForDay,
  computeRecentRollups,
  backfillRollups,
  startRollupWorker
};
