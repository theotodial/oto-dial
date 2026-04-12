const buckets = globalThis.__otoDialUsageRateLimits || new Map();

if (!globalThis.__otoDialUsageRateLimits) {
  globalThis.__otoDialUsageRateLimits = buckets;
}

function getWindowConfig(channel) {
  if (channel === "call") {
    return { limit: 10, windowMs: 60_000 };
  }
  if (channel === "sms") {
    return { limit: 20, windowMs: 60_000 };
  }
  return { limit: 10, windowMs: 60_000 };
}

export function enforceUsageRateLimit({ userId, channel }) {
  const key = `${String(userId || "")}:${channel}`;
  const now = Date.now();
  const { limit, windowMs } = getWindowConfig(channel);
  const row = buckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (row.resetAt <= now) {
    row.count = 0;
    row.resetAt = now + windowMs;
  }

  row.count += 1;
  buckets.set(key, row);

  return {
    allowed: row.count <= limit,
    limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterMs: Math.max(0, row.resetAt - now),
    resetAt: row.resetAt,
  };
}
