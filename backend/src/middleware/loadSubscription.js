import {
  getCachedUserSubscription,
  invalidateUserSubscriptionCache,
} from "../services/subscriptionService.js";
import { lazyMigrateUserById } from "../services/creditMigrationService.js";
import {
  isCallsApiRequest,
  logMiddlewareEnter,
  logMiddlewarePass,
} from "../utils/callsApiMiddlewareAudit.js";

export async function invalidateLoadSubscriptionCache(userId) {
  await invalidateUserSubscriptionCache(userId);
}

export default async function loadSubscription(req, res, next) {
  if (isCallsApiRequest(req)) {
    logMiddlewareEnter("loadSubscription", req);
  }
  try {
    if (!req.user || !req.user._id) {
      req.subscription = null;
      logMiddlewarePass("loadSubscription", req, { note: "no_user_skipped_subscription_load" });
      return next();
    }

    // Backward-compatible lazy migration: preserve old minute balances numerically.
    await lazyMigrateUserById(req.user._id).catch(() => {});
    req.subscription = await getCachedUserSubscription(req.user._id);
    logMiddlewarePass("loadSubscription", req, {
      subscriptionId: req.subscription?.id ? String(req.subscription.id) : req.subscription?._id ? String(req.subscription._id) : null,
    });
    next();
  } catch (err) {
    console.error("loadSubscription error:", err);
    req.subscription = null;
    logMiddlewarePass("loadSubscription", req, {
      loadError: true,
      message: err?.message || String(err),
    });
    next();
  }
}
