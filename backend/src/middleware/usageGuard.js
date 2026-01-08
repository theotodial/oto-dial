import Subscription from "../models/Subscription.js";

const usageGuard = (type) => {
  return async (req, res, next) => {
    try {
      const subscription = await Subscription.findOne({
        userId: req.userId,
        status: "active"
      });

      if (!subscription) {
        return res.status(403).json({
          error: "No active subscription"
        });
      }

      const { usage, limits, hardStop } = subscription;

      if (type === "call" && hardStop && usage.minutesUsed >= limits.minutesTotal) {
        return res.status(403).json({
          error: "Call minutes limit reached"
        });
      }

      if (type === "sms" && hardStop && usage.smsUsed >= limits.smsTotal) {
        return res.status(403).json({
          error: "SMS limit reached"
        });
      }

      req.subscription = subscription;
      next();
    } catch (err) {
      console.error("USAGE GUARD ERROR:", err);
      res.status(500).json({ error: "Usage validation failed" });
    }
  };
};

export default usageGuard;
