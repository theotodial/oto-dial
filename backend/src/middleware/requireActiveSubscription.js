export default function requireActiveSubscription(req, res, next) {
  if (!req.subscription || !req.subscription.active) {
    return res.status(403).json({
      success: false,
      error: "Active subscription required"
    });
  }

  next();
}
