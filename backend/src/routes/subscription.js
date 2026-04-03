import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import StripeInvoice from "../models/StripeInvoice.js";
import User from "../models/User.js";
import authMiddleware from "../middleware/authenticateUser.js";
import { selfHealSubscriptionForUser } from "../services/stripeSubscriptionService.js";

const router = express.Router();

// GET /plans and GET /addons are served by subscriptionCatalog.js (public, no auth)

// Default limits for subscription
const DEFAULT_LIMITS = {
  minutesTotal: 2500,
  smsTotal: 200,
  numbersTotal: 1
};

/**
 * GET /api/subscription and GET /api/subscription/current
 */
const getSubscriptionHandler = async (req, res) => {
  try {
    const userId = req.userId;

    try {
      await selfHealSubscriptionForUser(userId, "subscription_read");
    } catch (healErr) {
      console.warn(`⚠️ /api/subscription self-heal failed for ${userId}:`, healErr.message);
    }

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
};

router.get("/", authMiddleware, getSubscriptionHandler);
router.get("/current", authMiddleware, getSubscriptionHandler);

/**
 * GET /api/subscription/activation-health
 * Detects paid-but-not-active mismatches for support prompts.
 */
router.get("/activation-health", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const [activeSubscription, recentPaidInvoice] = await Promise.all([
      Subscription.findOne({
        userId,
        status: "active"
      }).sort({ updatedAt: -1 }),
      StripeInvoice.findOne({
        userId,
        status: "paid"
      }).sort({ issuedAt: -1, createdAt: -1 })
    ]);

    const recentPaidWindowMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const paidAt = recentPaidInvoice?.issuedAt
      ? new Date(recentPaidInvoice.issuedAt).getTime()
      : (recentPaidInvoice?.createdAt ? new Date(recentPaidInvoice.createdAt).getTime() : null);

    const hasRecentPaidInvoice = !!paidAt && (now - paidAt) <= recentPaidWindowMs;
    const showIssueReport = hasRecentPaidInvoice && !activeSubscription;

    res.json({
      success: true,
      hasActiveSubscription: !!activeSubscription,
      hasRecentPaidInvoice,
      showIssueReport,
      activeSubscriptionId: activeSubscription?._id || null,
      recentPaidInvoice: recentPaidInvoice
        ? {
            invoiceId: recentPaidInvoice.invoiceId,
            customerId: recentPaidInvoice.customerId,
            amountPaid: recentPaidInvoice.amountPaid,
            currency: recentPaidInvoice.currency,
            issuedAt: recentPaidInvoice.issuedAt || recentPaidInvoice.createdAt
          }
        : null
    });
  } catch (err) {
    console.error("Activation health check error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to check activation health"
    });
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

export default router;
