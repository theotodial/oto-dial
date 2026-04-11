import { loadUserSubscription } from "../services/subscriptionService.js";

const CACHE_TTL_MS = 5000;
const subscriptionCache = new Map();

export function invalidateLoadSubscriptionCache(userId) {
  if (!userId) return;
  subscriptionCache.delete(String(userId));
}

export default async function loadSubscription(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      req.subscription = null;
      return next();
    }

    const key = String(req.user._id);
    const now = Date.now();
    const hit = subscriptionCache.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      req.subscription = hit.value;
      return next();
    }

    const value = await loadUserSubscription(req.user._id);
    subscriptionCache.set(key, { at: now, value });
    req.subscription = value;
    next();
  } catch (err) {
    console.error("loadSubscription error:", err);
    req.subscription = null;
    next();
  }
}
