import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/authenticateUser.js";

const router = express.Router();

/**
 * GET /api/subscription/plans
 * Get all available subscription plans (public endpoint)
 */
router.get("/plans", async (req, res) => {
  try {
    const plans = await Plan.find({ active: true }).sort({ price: 1 }).select('-__v');
    res.json({
      success: true,
      plans: plans.map(plan => ({
        _id: plan._id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        limits: plan.limits,
        stripeProductId: plan.stripeProductId,
        stripePriceId: plan.stripePriceId
      }))
    });
  } catch (err) {
    console.error("Fetch plans error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch plans"
    });
  }
});

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

    // Get subscription - include both active and cancelled (cancelled subscriptions are still active until periodEnd)
    let subscription = await Subscription.findOne({
      userId,
      $or: [
        { status: "active" },
        { status: "cancelled" }
      ]
    }).populate("planId").sort({ createdAt: -1 });

    // Self-heal legacy race-condition records:
    // user is marked active, but subscription got reverted to pending_activation.
    if (!subscription) {
      const user = await User.findById(userId).select("subscriptionActive activeSubscriptionId");
      if (user?.subscriptionActive && user.activeSubscriptionId) {
        const pendingSubscription = await Subscription.findOne({
          _id: user.activeSubscriptionId,
          userId,
          status: "pending_activation"
        }).populate("planId");

        if (pendingSubscription) {
          pendingSubscription.status = "active";
          await pendingSubscription.save();
          subscription = pendingSubscription;
          console.log(`✅ Auto-healed pending subscription ${pendingSubscription._id} for user ${userId}`);
        }
      }
    }

    if (!subscription) {
      return res.json({
        planName: "No Plan",
        minutesRemaining: 0,
        smsRemaining: 0,
        status: "inactive",
      });
    }

    // minutesUsed field stores SECONDS internally
    const secondsUsed = subscription.usage?.minutesUsed || 0;

    // Apply add-ons only if not expired
    const now = new Date();
    const addonMinutesActive =
      subscription.addonsMinutesExpiry &&
      subscription.addonsMinutesExpiry > now
        ? subscription.addons?.minutes || 0
        : 0;

    const minutesTotal =
      (subscription.limits?.minutesTotal || 0) + addonMinutesActive;
    const secondsTotal = minutesTotal * 60;
    const secondsRemaining = Math.max(0, secondsTotal - secondsUsed);
    
    // Convert remaining seconds to minutes for display (with decimals)
    const minutesRemaining = secondsRemaining / 60;

    const addonSmsActive =
      subscription.addonsSmsExpiry &&
      subscription.addonsSmsExpiry > now
        ? subscription.addons?.sms || 0
        : 0;

    const smsRemaining = Math.max(
      0,
      (subscription.limits?.smsTotal || 0) +
        addonSmsActive -
        (subscription.usage?.smsUsed || 0)
    );

    res.json({
      planName: subscription.planId?.name || "Active Plan",
      minutesRemaining,
      smsRemaining,
      status: subscription.status || "active",
      periodEnd: subscription.periodEnd,
      periodStart: subscription.periodStart,
      limits: subscription.limits,
      totalMinutes: subscription.limits?.minutesTotal || 0,
      totalSMS: subscription.limits?.smsTotal || 0,
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
 * POST /api/subscription/cancel
 * Cancel subscription - no refunds, account remains active until periodEnd
 */
router.post("/cancel", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const subscription = await Subscription.findOne({
      userId,
      status: "active"
    });

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Mark subscription as cancelled but keep it active until periodEnd
    // This ensures user keeps access until the end of the billing cycle
    subscription.status = "cancelled";
    await subscription.save();

    console.log(`✅ Subscription cancelled for user ${userId}. Active until ${subscription.periodEnd}`);

    res.json({
      success: true,
      message: "Subscription cancelled successfully. Your account will remain active until the end of the current billing cycle.",
      periodEnd: subscription.periodEnd
    });
  } catch (err) {
    console.error("CANCEL SUBSCRIPTION ERROR:", err);
    res.status(500).json({ error: "Failed to cancel subscription" });
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

/**
 * GET /api/subscription/addons
 * Public endpoint listing available add-on plans
 */
router.get("/addons", async (req, res) => {
  try {
    const addons = await AddonPlan.find({ active: true }).sort({ price: 1 }).select("-__v");
    res.json({
      success: true,
      addons: addons.map((addon) => ({
        _id: addon._id,
        name: addon.name,
        type: addon.type,
        price: addon.price,
        currency: addon.currency,
        quantity: addon.quantity
      }))
    });
  } catch (err) {
    console.error("Fetch addons error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch add-ons"
    });
  }
});


export default router;
