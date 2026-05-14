import {
  getCachedUserSubscription,
  invalidateUserSubscriptionCache,
} from "../services/subscriptionService.js";
import { lazyMigrateUserById } from "../services/creditMigrationService.js";

export async function invalidateLoadSubscriptionCache(userId) {
  await invalidateUserSubscriptionCache(userId);
}

export default async function loadSubscription(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      req.subscription = null;
      return next();
    }

    // Backward-compatible lazy migration: preserve old minute balances numerically.
    await lazyMigrateUserById(req.user._id).catch(() => {});
    req.subscription = await getCachedUserSubscription(req.user._id);
    next();
  } catch (err) {
    console.error("loadSubscription error:", err);
    req.subscription = null;
    next();
  }
}
