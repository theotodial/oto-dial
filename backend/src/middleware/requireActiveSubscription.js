function hasSubscriptionRecord(sub) {
  return Boolean(sub && (sub.id != null || sub._id != null));
}

/** Usage is allowed whenever a subscription document exists (any status). */
export default function requireActiveSubscription(req, res, next) {
  if (!hasSubscriptionRecord(req.subscription)) {
    console.warn("[CALL FLOW] requireActiveSubscription BLOCK (no subscription row)", {
      path: req.originalUrl || req.path,
      userId: req.userId ? String(req.userId) : null,
    });
    return res.status(403).json({
      success: false,
      error: "No subscription found",
    });
  }

  next();
}
