/**
 * timeframeService
 *
 * Rolling window resolver for the Live Operations Center and realtime KPIs.
 * Default window: last 15 minutes.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Preset key → duration in ms (null = use custom/all logic). */
export const TIMEFRAME_MS = {
  "5m": 5 * MINUTE_MS,
  "10m": 10 * MINUTE_MS,
  "15m": 15 * MINUTE_MS,
  "30m": 30 * MINUTE_MS,
  "45m": 45 * MINUTE_MS,
  "1h": HOUR_MS,
  "2h": 2 * HOUR_MS,
  "3h": 3 * HOUR_MS,
  "4h": 4 * HOUR_MS,
  "5h": 5 * HOUR_MS,
  "6h": 6 * HOUR_MS,
  "12h": 12 * HOUR_MS,
  "24h": DAY_MS,
  "48h": 2 * DAY_MS,
  "72h": 3 * DAY_MS,
  "7d": 7 * DAY_MS,
  "14d": 14 * DAY_MS,
  "21d": 21 * DAY_MS,
  "30d": 30 * DAY_MS,
  "60d": 60 * DAY_MS,
  "90d": 90 * DAY_MS
};

export const TIMEFRAME_PRESETS = new Set([
  ...Object.keys(TIMEFRAME_MS),
  "custom",
  "custom_dt",
  "all"
]);

export const DEFAULT_TIMEFRAME = "15m";

/**
 * Resolve a rolling analytics window to absolute { start, end } bounds.
 */
export function resolveTimeframe({
  window = DEFAULT_TIMEFRAME,
  startDate = null,
  endDate = null,
  tzOffset = 0
} = {}) {
  const now = new Date();
  const key = String(window || DEFAULT_TIMEFRAME).trim();

  if (key === "all") {
    return {
      start: new Date("2020-01-01T00:00:00.000Z"),
      end: now,
      label: "all",
      window: key,
      tzOffset
    };
  }

  if (key === "custom" || key === "custom_dt") {
    let start = startDate ? new Date(startDate) : new Date(now.getTime() - TIMEFRAME_MS["15m"]);
    let end = endDate ? new Date(endDate) : now;
    if (Number.isNaN(start.getTime())) start = new Date(now.getTime() - TIMEFRAME_MS["15m"]);
    if (Number.isNaN(end.getTime())) end = now;
    if (end > now) end = now;
    if (start > end) start = new Date(end.getTime() - TIMEFRAME_MS["15m"]);
    return { start, end, label: key, window: key, tzOffset };
  }

  const duration = TIMEFRAME_MS[key];
  if (duration) {
    return {
      start: new Date(now.getTime() - duration),
      end: now,
      label: key,
      window: key,
      tzOffset
    };
  }

  return {
    start: new Date(now.getTime() - TIMEFRAME_MS[DEFAULT_TIMEFRAME]),
    end: now,
    label: DEFAULT_TIMEFRAME,
    window: DEFAULT_TIMEFRAME,
    tzOffset
  };
}

/** Whether this window should merge in-memory live session overlay. */
export function isLiveOverlayWindow(windowKey) {
  const ms = TIMEFRAME_MS[String(windowKey || DEFAULT_TIMEFRAME)];
  return ms != null && ms <= 6 * HOUR_MS;
}

export default {
  TIMEFRAME_MS,
  TIMEFRAME_PRESETS,
  DEFAULT_TIMEFRAME,
  resolveTimeframe,
  isLiveOverlayWindow
};
