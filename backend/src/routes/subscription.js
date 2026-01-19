import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import authenticateUser from "../middleware/authenticateUser.js";

const router = express.Router();

/**
 * GET /api/subscription
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;

    const subscription = await Subscription.findOne({
      userId,
      status: "active"
    }).populate("planId");

    if (!subscription) {
      return res.json({
        planName: "No Plan",
        minutesRemaining: 0,
        smsRemaining: 0,
        numbersRemaining: 0
      });
    }

    const minutesRemaining =
      subscription.limits.minutesTotal -
      subscription.usage.minutesUsed;

    const smsRemaining =
      subscription.limits.smsTotal -
      subscription.usage.smsUsed;

    const numbersRemaining =
      subscription.limits.numbersTotal;

    res.json({
      planName: subscription.planId?.name || "Active Plan",
      minutesRemaining: Math.max(0, minutesRemaining),
      smsRemaining: Math.max(0, smsRemaining),
      numbersRemaining: Math.max(0, numbersRemaining),
      subscription
    });
  } catch (err) {
    console.error("GET /subscription error:", err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * POST /api/subscription/buy
 */
router.post("/buy", authenticateUser, async (req, res) => {
  try {
    const userId = req.user._id;

    const plan = await Plan.findOne({
      name: "basic",
      status: "active"
    });

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
        numbersTotal: plan.limits.numbersTotal
      },
      usage: {
        minutesUsed: 0,
        smsUsed: 0
      },
      addons: {
        minutes: 0,
        sms: 0
      }
    });

    res.status(201).json({
      message: "Subscription activated",
      subscription
    });
  } catch (err) {
    console.error("SUBSCRIPTION BUY ERROR:", err);
    res.status(500).json({ message: "Failed to create subscription" });
  }
});

export default router;
