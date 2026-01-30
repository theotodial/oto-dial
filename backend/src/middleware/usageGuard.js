/**
 * CANONICAL USAGE GUARD
 * --------------------
 * Subscription collection is the single source of truth.
 * If subscription is ACTIVE, usage is allowed.
 * No legacy usage counters or usageLog checks are permitted.
 */

module.exports = function usageGuard(feature) {
  return async function (req, res, next) {
    try {
      const subscription = req.subscription;

      if (!subscription) {
        return res.status(403).json({
          success: false,
          message: "No active subscription found"
        });
      }

      if (subscription.status !== "active") {
        return res.status(403).json({
          success: false,
          message: "Subscription is not active"
        });
      }

      /**
       * IMPORTANT:
       * We DO NOT block based on usage numbers here.
       * Usage tracking is informational only.
       */
      return next();

    } catch (error) {
      console.error("UsageGuard Error:", error);
      return res.status(500).json({
        success: false,
        message: "Usage validation failed"
      });
    }
  };
};
