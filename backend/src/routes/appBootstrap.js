import express from "express";
import User from "../models/User.js";
import { computeUsage } from "../services/usageComputationService.js";
import { getLatestSubscription } from "../services/subscriptionService.js";

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

    const [userDoc, latestSub, usageActivity] = await Promise.all([
      User.findById(userId).select("_id name email isEmailVerified").lean(),
      getLatestSubscription(userId),
      computeUsage(userId),
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
      const smsLimit = Number(latestSub.limits?.smsTotal);
      const minutesLimit = Number(latestSub.limits?.minutesTotal);
      const smsUsed = usageActivity.smsUsed;
      const minutesUsed = usageActivity.minutesUsed;

      subscription = {
        id: latestSub._id,
        status: latestSub.status,
        planName:
          latestSub.planName ?? latestSub.planType ?? latestSub.planKey ?? null,
        limits: latestSub.limits ?? null,
        hasSubscription: true,
        isActive: latestSub.status === "active",
        showUsage: true,
      };

      usage = {
        smsUsed,
        minutesUsed,
        smsRemaining: smsLimit - smsUsed,
        minutesRemaining: minutesLimit - minutesUsed,
        smsLimit,
        minutesLimit,
        isSmsEnabled: smsLimit > 0,
        isCallEnabled: minutesLimit > 0,
      };

      console.log("[FINAL USAGE CHECK]", {
        userId: String(userId || ""),
        subscriptionId: String(latestSub._id),
        status: latestSub.status,
        smsUsed,
        minutesUsed,
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
