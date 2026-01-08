import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import authMiddleware from "../middleware/authenticateUser.js";

const router = express.Router();

/**
 * GET /api/subscription
 * Get current user's subscription details
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    // Find active subscription
    const subscription = await Subscription.findOne({
      userId,
      status: "active"
    }).populate("planId");

    if (!subscription) {
      return res.json({
        planName: "No Plan",
        remainingMinutes: 0,
        remainingSMS: 0
      });
    }

    const plan = subscription.planId;
    const remainingMinutes = Math.max(0, (subscription.limits.minutesTotal + subscription.addons.minutes) - subscription.usage.minutesUsed);
    const remainingSMS = Math.max(0, (subscription.limits.smsTotal + subscription.addons.sms) - subscription.usage.smsUsed);

    res.json({
      planName: plan?.name || "Active Plan",
      remainingMinutes,
      remainingSMS,
      subscription
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * POST /api/subscription/buy
 * Simulates successful payment
 */
router.post("/buy", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;


    // 1️⃣ find basic plan
    const plan = await Plan.findOne({ name: "basic", isActive: true });

    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    // 2️⃣ calculate billing period (30 days)
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(now.getDate() + 30);

    // 3️⃣ create subscription
    const subscription = await Subscription.create({
      userId,
      planId: plan._id,

      periodStart: now,
      periodEnd,

      limits: {
        minutesTotal: plan.included.minutes,
        smsTotal: plan.included.sms
      }
    });

    res.status(201).json({
      message: "Subscription activated",
      subscription
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create subscription" });
  }
});

export default router;
