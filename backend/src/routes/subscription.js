import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import authMiddleware from "../middleware/authenticateUser.js";

const router = express.Router();

/**
 * GET /api/subscription
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const subscription = await Subscription.findOne({
      userId,
      status: "active",
    }).populate("planId");

    if (!subscription) {
      return res.json({
        planName: "No Plan",
        minutesRemaining: 0,
        smsRemaining: 0,
      });
    }

    const minutesRemaining = Math.max(
      0,
      (subscription.limits?.minutesTotal || 0) +
        (subscription.addons?.minutes || 0) -
        (subscription.usage?.minutesUsed || 0)
    );

    const smsRemaining = Math.max(
      0,
      (subscription.limits?.smsTotal || 0) +
        (subscription.addons?.sms || 0) -
        (subscription.usage?.smsUsed || 0)
    );

    res.json({
      planName: subscription.planId?.name || "Active Plan",
      minutesRemaining,
      smsRemaining,
      subscription,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * POST /api/subscription/buy
 */
router.post("/buy", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const plan = await Plan.findOne({
      name: "Basic",
      active: true,
    }).lean();

    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(now.getDate() + 30);

    const subscription = await Subscription.create({
      userId,
      planId: plan._id,
      status: "active",

      periodStart: now,
      periodEnd,

      limits: {
        minutesTotal: plan.limits.minutesTotal,
        smsTotal: plan.limits.smsTotal,
        numbersTotal: plan.limits.numbersTotal,
      },

      usage: {
        minutesUsed: 0,
        smsUsed: 0,
      },

      addons: {
        minutes: 0,
        sms: 0,
      },
    });

    res.status(201).json({
      message: "Subscription activated",
      subscription,
    });
  } catch (err) {
    console.error("SUBSCRIPTION BUY ERROR:", err);
    res.status(500).json({ message: "Failed to create subscription" });
  }
});

export default router;
