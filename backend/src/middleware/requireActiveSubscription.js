import Subscription from "../models/Subscription.js";

const requireActiveSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      userId: req.userId,
      status: "active"
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: "No active subscription"
      });
    }

    // SAFETY: ensure usage object exists
    if (!subscription.usage) {
      subscription.usage = { minutesUsed: 0, smsUsed: 0 };
      await subscription.save();
    }

    // SAFETY: ensure limits exist
    if (!subscription.limits) {
      return res.status(500).json({
        success: false,
        error: "Subscription limits misconfigured"
      });
    }

    if (
      subscription.hardStop &&
      subscription.usage.minutesUsed >= subscription.limits.minutesTotal
    ) {
      return res.status(403).json({
        success: false,
        error: "Call minutes limit reached"
      });
    }

    req.subscription = subscription;
    next();
  } catch (err) {
    console.error("SUBSCRIPTION CHECK ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Subscription validation failed"
    });
  }
};

export default requireActiveSubscription;
