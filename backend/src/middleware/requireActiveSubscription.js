import {
  isCallsApiRequest,
  logMiddlewareBlock,
  logMiddlewareEnter,
  logMiddlewarePass,
} from "../utils/callsApiMiddlewareAudit.js";

function hasSubscriptionRecord(sub) {
  return Boolean(sub && (sub.id != null || sub._id != null));
}

/** Usage is allowed whenever a subscription document exists (any status). */
export default function requireActiveSubscription(req, res, next) {
  if (isCallsApiRequest(req)) {
    logMiddlewareEnter("requireActiveSubscription", req);
  }
  if (!hasSubscriptionRecord(req.subscription)) {
    console.warn("[CALL FLOW] requireActiveSubscription BLOCK (no subscription row)", {
      path: req.originalUrl || req.path,
      userId: req.userId ? String(req.userId) : null,
    });
    const body = {
      success: false,
      error: "No subscription found",
    };
    logMiddlewareBlock("requireActiveSubscription", req, {
      status: 403,
      reason: "no_subscription_row",
      body,
    });
    return res.status(403).json(body);
  }

  logMiddlewarePass("requireActiveSubscription", req);
  next();
}
