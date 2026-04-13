/**
 * Subscription document must exist; billing status does not gate access.
 */

module.exports = function usageGuard(feature) {
  return async function (req, res, next) {
    try {
      const subscription = req.subscription;

      if (!subscription || !(subscription.id != null || subscription._id != null)) {
        return res.status(403).json({
          success: false,
          message: "No subscription found",
        });
      }

      return next();
    } catch (error) {
      console.error("UsageGuard Error:", error);
      return res.status(500).json({
        success: false,
        message: "Usage validation failed",
      });
    }
  };
};
