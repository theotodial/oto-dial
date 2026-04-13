import express from "express";
import User from "../models/User.js";
import { getLatestSubscription } from "../services/subscriptionService.js";
import { getCanonicalUsage } from "../services/usage/getCanonicalUsage.js";
import { isUnlimitedSubscription } from "../services/unlimitedUsageService.js";
import { getSubscriptionUsageDisplayFlags } from "../utils/subscriptionDisplayFlags.js";

const router = express.Router();

function emptyUsage() {
  return {
    smsUsed: 0,
    minutesUsed: 0,
    smsRemaining: 0,
    minutesRemaining: 0,
    smsLimit: 0,
    minutesLimit: 0,
    isSmsEnabled: false,
    isCallEnabled: false,
  };
}

router.get("/bootstrap", async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    console.log("[bootstrap] START", {
      userId: String(userId || ""),
    });

    const [userDoc, latestSub] = await Promise.all([
      User.findById(userId).select("_id name email isEmailVerified").lean(),
      getLatestSubscription(userId),
    ]);

    const user = userDoc
      ? {
          _id: userDoc._id,
          id: userDoc._id,
          name: userDoc.name || "",
          email: userDoc.email,
          isEmailVerified: userDoc.isEmailVerified !== false,
        }
      : null;

    let subscription = null;
    let usage = emptyUsage();

    if (latestSub) {
      const canonical = await getCanonicalUsage(userId, latestSub);
      const rawLimits = latestSub.limits || {};
      const isManuallyEnabled =
        Number(rawLimits.smsTotal ?? 0) > 0 ||
        Number(rawLimits.minutesTotal ?? 0) > 0;
      const uiFlags = getSubscriptionUsageDisplayFlags(latestSub);

      subscription = {
        id: latestSub._id,
        status: latestSub.status,
        planName:
          latestSub.planName ?? latestSub.planType ?? latestSub.planKey ?? null,
        limits: latestSub.limits ?? null,
        hasSubscription: true,
        isActive: latestSub.status === "active",
        isManuallyEnabled,
        showUsage: true,
        planType: latestSub.planType ?? null,
        displayUnlimited: Boolean(latestSub.displayUnlimited),
        isUnlimited: Boolean(isUnlimitedSubscription(latestSub)),
        unlimitedMinutesDisplay: uiFlags.unlimitedMinutesDisplay,
        unlimitedSmsDisplay: uiFlags.unlimitedSmsDisplay,
      };

      usage = {
        smsUsed: canonical.smsUsed,
        minutesUsed: canonical.minutesUsed,
        smsRemaining: canonical.smsRemaining,
        minutesRemaining: canonical.minutesRemaining,
        smsLimit: canonical.smsLimit,
        minutesLimit: canonical.minutesLimit,
        isSmsEnabled: canonical.isSmsEnabled,
        isCallEnabled: canonical.isCallEnabled,
      };

      console.log("[FINAL USAGE CHECK]", {
        userId: String(userId || ""),
        subscriptionId: String(latestSub._id),
        status: latestSub.status,
        smsUsed: usage.smsUsed,
        minutesUsed: usage.minutesUsed,
        smsRemaining: usage.smsRemaining,
        minutesRemaining: usage.minutesRemaining,
      });
    }

    return res.json({
      success: true,
      user,
      subscription,
      usage,
    });
  } catch (err) {
    console.error("GET /api/app/bootstrap error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load bootstrap state",
    });
  }
});

export default router;
