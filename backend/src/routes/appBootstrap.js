import express from "express";
import {
  buildPublicSubscriptionState,
  buildEffectiveUsage,
  getCachedUserSubscription,
} from "../services/subscriptionService.js";

const router = express.Router();

router.get("/bootstrap", async (req, res) => {
  try {
    console.log("[bootstrap] START", {
      userId: String(req.userId || req.user?._id || ""),
    });

    const user = req.user
      ? {
          _id: req.user._id,
          id: req.user._id,
          name: req.user.name || "",
          email: req.user.email,
          isEmailVerified: req.user.isEmailVerified !== false
        }
      : null;

    const rawSubscription = await getCachedUserSubscription(req.userId);
    const subscription = buildPublicSubscriptionState(rawSubscription);
    const usage = buildEffectiveUsage({
      subscription: rawSubscription,
      customPackage: rawSubscription?.customPackage || null,
    });

    console.log("[bootstrap] SUB RESULT", {
      userId: String(req.userId || ""),
      subscriptionStatus: subscription?.status ?? null,
      subscriptionPlan: subscription?.planName ?? null,
      subscriptionActive: subscription?.active ?? null,
    });

    return res.json({
      success: true,
      user,
      subscription,
      customPackage: rawSubscription?.customPackage || null,
      usage,
    });
  } catch (err) {
    console.error("GET /api/app/bootstrap error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load bootstrap state"
    });
  }
});

export default router;
