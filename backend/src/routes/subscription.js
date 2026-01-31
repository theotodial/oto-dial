import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import authMiddleware from "../middleware/authenticateUser.js";

const router = express.Router();

// Default limits for subscription
const DEFAULT_LIMITS = {
  minutesTotal: 2500,
  smsTotal: 200,
  numbersTotal: 1
};

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

    // minutesUsed field stores SECONDS internally
    const secondsUsed = subscription.usage?.minutesUsed || 0;
    const minutesTotal = (subscription.limits?.minutesTotal || 0) + (subscription.addons?.minutes || 0);
    const secondsTotal = minutesTotal * 60;
    const secondsRemaining = Math.max(0, secondsTotal - secondsUsed);
    
    // Convert remaining seconds to minutes for display (with decimals)
    const minutesRemaining = secondsRemaining / 60;

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

    let plan = await Plan.findOne({
      name: "Basic",
      active: true,
    }).lean();

    // Create default plan if it doesn't exist
    if (!plan) {
      plan = await Plan.create({
        name: "Basic",
        price: 19.99,
        currency: "USD",
        limits: DEFAULT_LIMITS,
        active: true
      });
      plan = plan.toObject();
    }

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(now.getDate() + 30);

    // Check for existing subscription
    const existing = await Subscription.findOne({ userId, status: "active" });
    if (existing) {
      return res.json({
        message: "Subscription already active",
        subscription: existing,
      });
    }

    const subscription = await Subscription.create({
      userId,
      planId: plan._id,
      status: "active",

      periodStart: now,
      periodEnd,

      limits: {
        minutesTotal: plan.limits?.minutesTotal || DEFAULT_LIMITS.minutesTotal,
        smsTotal: plan.limits?.smsTotal || DEFAULT_LIMITS.smsTotal,
        numbersTotal: plan.limits?.numbersTotal || DEFAULT_LIMITS.numbersTotal,
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

/**
 * POST /api/subscription/fix
 * Fix subscription with missing or zero limits
 */
router.post("/fix", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const subscription = await Subscription.findOne({
      userId,
      status: "active",
    });

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Check if limits need fixing
    const needsFix = !subscription.limits || 
      !subscription.limits.smsTotal || 
      subscription.limits.smsTotal <= 0 ||
      !subscription.limits.minutesTotal ||
      subscription.limits.minutesTotal <= 0;

    if (!needsFix) {
      return res.json({
        message: "Subscription limits are already valid",
        subscription
      });
    }

    // Get limits from plan or use defaults
    let limits = DEFAULT_LIMITS;
    if (subscription.planId) {
      const plan = await Plan.findById(subscription.planId).lean();
      if (plan?.limits) {
        limits = plan.limits;
      }
    }

    // Update subscription with proper limits
    subscription.limits = {
      minutesTotal: limits.minutesTotal || DEFAULT_LIMITS.minutesTotal,
      smsTotal: limits.smsTotal || DEFAULT_LIMITS.smsTotal,
      numbersTotal: limits.numbersTotal || DEFAULT_LIMITS.numbersTotal
    };

    await subscription.save();

    console.log(`✅ Fixed subscription for user ${userId}:`, subscription.limits);

    res.json({
      message: "Subscription limits fixed",
      subscription
    });
  } catch (err) {
    console.error("SUBSCRIPTION FIX ERROR:", err);
    res.status(500).json({ error: "Failed to fix subscription" });
  }
});

/**
 * POST /api/subscription/reset-usage
 * Reset SMS and minutes usage (for testing/admin)
 */
router.post("/reset-usage", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const subscription = await Subscription.findOneAndUpdate(
      { userId, status: "active" },
      {
        $set: {
          "usage.smsUsed": 0,
          "usage.minutesUsed": 0
        }
      },
      { new: true }
    );

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    console.log(`✅ Reset usage for user ${userId}`);

    res.json({
      message: "Usage reset successfully",
      subscription
    });
  } catch (err) {
    console.error("RESET USAGE ERROR:", err);
    res.status(500).json({ error: "Failed to reset usage" });
  }
});

export default router;
