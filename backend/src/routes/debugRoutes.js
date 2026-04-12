import express from "express";
import User from "../models/User.js";
import { getActiveCustomPackage } from "../services/customPackageService.js";
import {
  buildEffectiveUsage,
  computeUserActivityUsage,
  getComputedUsageSnapshot,
  loadLatestSubscriptionDocument,
  loadUserSubscription,
} from "../services/subscriptionService.js";

const router = express.Router();

router.get("/subscription/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [user, subscription, customPackage, activityUsage, resolvedSubscription] =
      await Promise.all([
        User.findById(userId)
          .select("_id email name status activeSubscriptionId currentPlanId")
          .lean(),
        loadLatestSubscriptionDocument(userId),
        getActiveCustomPackage(userId),
        computeUserActivityUsage(userId),
        loadUserSubscription(userId),
      ]);

    const usage = buildEffectiveUsage({
      subscription: resolvedSubscription,
      customPackage,
      activityUsage,
    });

    return res.json({
      success: true,
      user,
      subscription,
      customPackage,
      smsUsed: activityUsage.smsUsed,
      minutesUsed: activityUsage.minutesUsed,
      smsRemaining: usage.smsRemaining,
      minutesRemaining: usage.minutesRemaining,
      resolvedSubscription,
    });
  } catch (err) {
    console.error("Debug subscription error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load debug subscription snapshot",
    });
  }
});

router.get("/user-usage/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const snapshot = await getComputedUsageSnapshot(userId);
    return res.json({
      success: true,
      ...snapshot,
    });
  } catch (err) {
    console.error("Debug user-usage error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load user usage snapshot",
    });
  }
});

export default router;
