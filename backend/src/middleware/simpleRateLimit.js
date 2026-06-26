/**
 * simpleRateLimit
 *
 * Lightweight, dependency-free in-memory rate limiter (fixed window per key).
 * Suitable for protecting analytics ingestion and admin analytics endpoints.
 * For multi-instance deployments this limits per-process; pair with an
 * upstream proxy limit for hard guarantees.
 */
export function createRateLimiter({
  windowMs = 60_000,
  max = 120,
  keyGenerator = (req) =>
    (req.headers["x-forwarded-for"]
      ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
      : null) ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown",
  message = "Too many requests, please slow down."
} = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Periodic cleanup to bound memory.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, windowMs).unref?.();
  void cleanup;

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = keyGenerator(req);
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ success: false, error: message });
    }

    return next();
  };
}

export default createRateLimiter;
