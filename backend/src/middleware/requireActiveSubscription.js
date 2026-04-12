export default function requireActiveSubscription(req, res, next) {
  if (!req.subscription || !req.subscription.active) {
    console.warn("[CALL FLOW] requireActiveSubscription BLOCK", {
      path: req.originalUrl || req.path,
      userId: req.userId ? String(req.userId) : null,
      hasSubscription: Boolean(req.subscription),
      active: req.subscription?.active,
    });
    return res.status(403).json({
      success: false,
      error: "Active subscription required"
    });
  }

  next();
}
