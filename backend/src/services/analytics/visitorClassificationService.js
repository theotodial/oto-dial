import AnalyticsVisitor from "../../models/analytics/AnalyticsVisitor.js";
import AnalyticsSession from "../../models/analytics/AnalyticsSession.js";
import { toUtcDayKey } from "./rollupService.js";

const RETURNING_GRACE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function sessionStartedInRange(start, end) {
  return { startedAt: { $gte: start, $lte: end } };
}

/**
 * Reliable upsert metadata: treat missing lastErrorObject as "existing" when value is present.
 */
export function wasVisitorInserted(rawResult) {
  const leo = rawResult?.lastErrorObject;
  if (leo) {
    if (leo.upserted) return true;
    return leo.updatedExisting === false;
  }
  return rawResult?.value == null;
}

export function isReturningFromVisitorMeta({ firstSeenAt, sessionCount, sessionStartedAt, flaggedReturning = false }) {
  if (flaggedReturning) return true;
  const sessions = Number(sessionCount || 0);
  if (sessions > 1) return true;
  if (!firstSeenAt || !sessionStartedAt) return false;
  const firstMs = new Date(firstSeenAt).getTime();
  const startMs = new Date(sessionStartedAt).getTime();
  if (!Number.isFinite(firstMs) || !Number.isFinite(startMs)) return false;
  return firstMs + RETURNING_GRACE_MS < startMs;
}

export async function loadVisitorMetaMap(visitorIds = []) {
  const ids = [...new Set((visitorIds || []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  const visitors = await AnalyticsVisitor.find({ visitorId: { $in: ids } })
    .select("visitorId firstSeenAt sessionCount")
    .lean();

  for (const v of visitors) {
    map.set(v.visitorId, {
      firstSeenAt: v.firstSeenAt,
      sessionCount: Number(v.sessionCount || 0),
    });
  }
  return map;
}

export function resolveReturningFlag(row, visitorMeta) {
  const meta = visitorMeta?.get?.(row.visitorId) || visitorMeta?.[row.visitorId] || null;
  return isReturningFromVisitorMeta({
    firstSeenAt: meta?.firstSeenAt || row.firstSeenAt,
    sessionCount: meta?.sessionCount ?? row.sessionCount,
    sessionStartedAt: row.sessionStartedAt || row.startedAt,
    flaggedReturning: Boolean(row.isReturning),
  });
}

export async function enrichRowsWithReturningStatus(rows = []) {
  if (!rows.length) return rows;
  const meta = await loadVisitorMetaMap(rows.map((r) => r.visitorId));
  return rows.map((row) => {
    const isReturning = resolveReturningFlag(row, meta);
    return {
      ...row,
      isReturning,
      isNew: !isReturning,
    };
  });
}

function classifyVisitorInRange(visitorId, visitorById, rangeStartMs) {
  const v = visitorById.get(visitorId);
  if (!v) return false;
  const firstMs = v.firstSeenAt ? new Date(v.firstSeenAt).getTime() : NaN;
  if (Number.isFinite(firstMs) && firstMs < rangeStartMs) return true;
  return Number(v.sessionCount || 0) > 1;
}

function classifyVisitorOnDay(visitorId, dayKey, visitorById) {
  const v = visitorById.get(visitorId);
  if (!v?.firstSeenAt) return "new";
  const firstKey = toUtcDayKey(v.firstSeenAt);
  if (firstKey === dayKey) return "new";
  if (firstKey < dayKey) return "returning";
  return "new";
}

export async function countReturningInRange(start, end) {
  const sessionMatch = sessionStartedInRange(start, end);
  const uniqueVisitorIds = await AnalyticsSession.distinct("visitorId", sessionMatch);

  if (!uniqueVisitorIds.length) {
    return { uniqueVisitors: 0, newVisitors: 0, returningVisitors: 0 };
  }

  const visitors = await AnalyticsVisitor.find({ visitorId: { $in: uniqueVisitorIds } })
    .select("visitorId firstSeenAt sessionCount")
    .lean();

  const visitorById = new Map(visitors.map((v) => [v.visitorId, v]));
  const rangeStartMs = start.getTime();
  let returningVisitors = 0;

  for (const visitorId of uniqueVisitorIds) {
    if (classifyVisitorInRange(visitorId, visitorById, rangeStartMs)) {
      returningVisitors += 1;
    }
  }

  const uniqueVisitors = uniqueVisitorIds.length;
  return {
    uniqueVisitors,
    newVisitors: Math.max(0, uniqueVisitors - returningVisitors),
    returningVisitors,
  };
}

/** Per-day unique / new / returning visitors (by session start day, UTC). */
export async function buildDailyVisitorSeries(start, end) {
  const sessionMatch = sessionStartedInRange(start, end);
  const rows = await AnalyticsSession.aggregate([
    { $match: sessionMatch },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt", timezone: "UTC" } },
          visitorId: "$visitorId",
        },
        sessions: { $sum: 1 },
      },
    },
  ]);

  const visitorIds = [...new Set(rows.map((r) => r._id.visitorId).filter(Boolean))];
  const visitorById = await loadVisitorMetaMap(visitorIds);
  const byDay = new Map();

  for (const row of rows) {
    const dayKey = row._id.day;
    const visitorId = row._id.visitorId;
    if (!dayKey || !visitorId) continue;

    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, { visitors: new Set(), sessions: 0, newVisitors: 0, returningVisitors: 0 });
    }
    const entry = byDay.get(dayKey);
    entry.sessions += row.sessions || 0;
    entry.visitors.add(visitorId);
  }

  const series = new Map();
  for (const [dayKey, entry] of byDay) {
    let newVisitors = 0;
    let returningVisitors = 0;
    for (const visitorId of entry.visitors) {
      const kind = classifyVisitorOnDay(visitorId, dayKey, visitorById);
      if (kind === "returning") returningVisitors += 1;
      else newVisitors += 1;
    }
    const uniqueVisitors = entry.visitors.size;
    series.set(dayKey, {
      date: dayKey,
      uniqueVisitors,
      visitors: uniqueVisitors,
      newVisitors,
      returningVisitors,
      sessions: entry.sessions,
    });
  }
  return series;
}

export function enumerateUtcDayKeys(start, end) {
  const keys = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= endDay.getTime()) {
    keys.push(toUtcDayKey(cursor));
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return keys;
}

export async function fetchReturningVisitorList({ start, end, limit = 50 } = {}) {
  const sessionMatch = sessionStartedInRange(start, end);

  const sessions = await AnalyticsSession.find(sessionMatch)
    .sort({ lastActivityAt: -1 })
    .limit(Math.min(500, limit * 5))
    .select(
      "visitorId sessionId userId startedAt lastActivityAt isReturning country city device browser entryPage exitPage pageViewCount hasSubscription signedUp"
    )
    .lean();

  if (!sessions.length) return [];

  const rows = sessions.map((doc) => ({
    visitorId: doc.visitorId,
    sessionId: doc.sessionId,
    userId: doc.userId ? String(doc.userId) : null,
    startedAt: doc.startedAt,
    sessionStartedAt: doc.startedAt,
    lastActivityAt: doc.lastActivityAt,
    isReturning: doc.isReturning,
    country: doc.country,
    city: doc.city,
    device: doc.device,
    browser: doc.browser,
    currentPage: doc.exitPage || doc.entryPage,
    pagesViewed: doc.pageViewCount || 0,
    isSubscriber: Boolean(doc.hasSubscription),
    signedUp: Boolean(doc.signedUp),
  }));

  const enriched = await enrichRowsWithReturningStatus(rows);
  const returning = enriched.filter((r) => r.isReturning);

  const byVisitor = new Map();
  for (const row of returning) {
    const existing = byVisitor.get(row.visitorId);
    if (!existing || new Date(row.lastActivityAt) > new Date(existing.lastActivityAt)) {
      byVisitor.set(row.visitorId, row);
    }
  }

  return Array.from(byVisitor.values())
    .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt))
    .slice(0, limit);
}

export default {
  wasVisitorInserted,
  isReturningFromVisitorMeta,
  enrichRowsWithReturningStatus,
  sessionStartedInRange,
  countReturningInRange,
  buildDailyVisitorSeries,
  enumerateUtcDayKeys,
  fetchReturningVisitorList,
};
