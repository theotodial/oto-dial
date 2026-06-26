/**
 * rangeService
 *
 * Resolves analytics date-range presets (today, 7d, this_month, etc.),
 * custom ranges, and comparison periods (previous period / year-over-year)
 * with optional timezone awareness (tzOffsetMinutes = minutes to ADD to UTC
 * to reach the viewer's local time, e.g. +300 for UTC+5).
 */

export const RANGE_PRESETS = new Set([
  "today",
  "yesterday",
  "7d",
  "14d",
  "30d",
  "90d",
  "this_month",
  "prev_month",
  "this_quarter",
  "this_year",
  "last_year",
  "all",
  "custom"
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function toLocal(date, tzOffsetMinutes) {
  return new Date(date.getTime() + tzOffsetMinutes * 60_000);
}
function fromLocal(date, tzOffsetMinutes) {
  return new Date(date.getTime() - tzOffsetMinutes * 60_000);
}
function localMidnight(date, tzOffsetMinutes) {
  const local = toLocal(date, tzOffsetMinutes);
  local.setUTCHours(0, 0, 0, 0);
  return fromLocal(local, tzOffsetMinutes);
}

export function resolveRange({
  range = "30d",
  startDate = null,
  endDate = null,
  tzOffset = 0
} = {}) {
  const tz = Number.isFinite(Number(tzOffset)) ? Number(tzOffset) : 0;
  const now = new Date();
  const todayStart = localMidnight(now, tz);
  let start;
  let end = now;
  let label = range;

  switch (range) {
    case "today":
      start = todayStart;
      break;
    case "yesterday":
      start = new Date(todayStart.getTime() - DAY_MS);
      end = new Date(todayStart.getTime() - 1);
      break;
    case "7d":
      start = new Date(todayStart.getTime() - 6 * DAY_MS);
      break;
    case "14d":
      start = new Date(todayStart.getTime() - 13 * DAY_MS);
      break;
    case "30d":
      start = new Date(todayStart.getTime() - 29 * DAY_MS);
      break;
    case "90d":
      start = new Date(todayStart.getTime() - 89 * DAY_MS);
      break;
    case "this_month": {
      const local = toLocal(now, tz);
      local.setUTCDate(1);
      local.setUTCHours(0, 0, 0, 0);
      start = fromLocal(local, tz);
      break;
    }
    case "prev_month": {
      const local = toLocal(now, tz);
      local.setUTCDate(1);
      local.setUTCHours(0, 0, 0, 0);
      const thisMonthStart = fromLocal(local, tz);
      const prevLocal = toLocal(thisMonthStart, tz);
      prevLocal.setUTCMonth(prevLocal.getUTCMonth() - 1);
      start = fromLocal(prevLocal, tz);
      end = new Date(thisMonthStart.getTime() - 1);
      break;
    }
    case "this_quarter": {
      const local = toLocal(now, tz);
      const q = Math.floor(local.getUTCMonth() / 3);
      local.setUTCMonth(q * 3, 1);
      local.setUTCHours(0, 0, 0, 0);
      start = fromLocal(local, tz);
      break;
    }
    case "this_year": {
      const local = toLocal(now, tz);
      local.setUTCMonth(0, 1);
      local.setUTCHours(0, 0, 0, 0);
      start = fromLocal(local, tz);
      break;
    }
    case "last_year": {
      const local = toLocal(now, tz);
      local.setUTCMonth(0, 1);
      local.setUTCHours(0, 0, 0, 0);
      const thisYearStart = fromLocal(local, tz);
      const lastLocal = toLocal(thisYearStart, tz);
      lastLocal.setUTCFullYear(lastLocal.getUTCFullYear() - 1);
      start = fromLocal(lastLocal, tz);
      end = new Date(thisYearStart.getTime() - 1);
      break;
    }
    case "all":
      start = new Date("2020-01-01T00:00:00.000Z");
      break;
    case "custom": {
      start = startDate ? new Date(startDate) : new Date(todayStart.getTime() - 29 * DAY_MS);
      end = endDate ? new Date(endDate) : now;
      if (Number.isNaN(start.getTime())) start = new Date(todayStart.getTime() - 29 * DAY_MS);
      if (Number.isNaN(end.getTime())) end = now;
      label = "custom";
      break;
    }
    default:
      start = new Date(todayStart.getTime() - 29 * DAY_MS);
      label = "30d";
  }

  if (end > now) end = now;
  return { start, end, label, tzOffset: tz };
}

/** Compute the comparison window for a resolved range. */
export function resolveComparison({ start, end }, compare = "previous_period") {
  if (compare === "none" || !compare) return null;
  const span = end.getTime() - start.getTime();
  if (compare === "yoy") {
    const cs = new Date(start);
    cs.setUTCFullYear(cs.getUTCFullYear() - 1);
    const ce = new Date(end);
    ce.setUTCFullYear(ce.getUTCFullYear() - 1);
    return { start: cs, end: ce, mode: "yoy" };
  }
  // previous_period (default)
  const ce = new Date(start.getTime() - 1);
  const cs = new Date(start.getTime() - span - 1);
  return { start: cs, end: ce, mode: "previous_period" };
}

export default { RANGE_PRESETS, resolveRange, resolveComparison };
