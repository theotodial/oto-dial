import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import StripeInvoice from "../models/StripeInvoice.js";
import authMiddleware from "../middleware/authenticateUser.js";
import {
  buildPublicPlanPayload,
  applyPlanSnapshotToSubscription
} from "../services/subscriptionPlanSnapshotService.js";
import { isUnlimitedSubscription } from "../services/unlimitedUsageService.js";
import { getActiveAddonAmounts } from "../services/subscriptionAddonCreditService.js";
import { maybeSendUsageWarningEmail } from "../services/usageWarningEmailService.js";

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
const SUBSCRIPTION_READ_SELECT =
  "planId status planType planName displayUnlimited usage limits addons addonsSmsExpiry addonsMinutesExpiry periodEnd periodStart monthlySmsLimit monthlyMinutesLimit dailySmsLimit dailyMinutesLimit";

const getSubscriptionHandler = async (req, res) => {
  try {
    const userId = req.userId;

    // Hot path: no Stripe/self-heal — reconciliation + login handle repair
    let subscription = await Subscription.findOne({
      userId,
      $or: [
        { status: "active" },
        { status: "cancelled" }
      ]
    })
      .select(SUBSCRIPTION_READ_SELECT)
      .populate({ path: "planId", select: "name displayUnlimited" })
      .sort({ createdAt: -1 })
      .lean();

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
    const activeAddons = getActiveAddonAmounts(subscription, now);
    const addonMinutesActive = activeAddons.minutesActive;

    const minutesTotal =
      (subscription.limits?.minutesTotal || 0) + addonMinutesActive;
    const secondsTotal = minutesTotal * 60;
    const secondsRemaining = Math.max(0, secondsTotal - secondsUsed);
    
    // Convert remaining seconds to minutes for display (with decimals)
    const minutesRemaining = secondsRemaining / 60;

    const addonSmsActive = activeAddons.smsActive;

    const smsRemaining = Math.max(
      0,
      (subscription.limits?.smsTotal || 0) +
        addonSmsActive -
        (subscription.usage?.smsUsed || 0)
    );

    const unlimited =
      isUnlimitedSubscription(subscription) ||
      Boolean(subscription.planId?.displayUnlimited) ||
      /unlimited/i.test(String(subscription.planId?.name || ""));

    const safeSubscription = unlimited
      ? {
          _id: subscription._id,
          planId: subscription.planId?._id || subscription.planId,
          planName: subscription.planId?.name || subscription.planName || "Unlimited",
          planType: "unlimited",
          displayUnlimited: true,
          status: subscription.status || "active",
          periodEnd: subscription.periodEnd,
          periodStart: subscription.periodStart
        }
      : subscription;

    // Usage warning email (>80% voice or SMS) — fire-and-forget, throttled per user
    if (!unlimited && req.user?.email) {
      const secondsTotalSafe = Math.max(1, minutesTotal * 60);
      const smsTotalEff =
        (subscription.limits?.smsTotal || 0) + addonSmsActive;
      const smsTotalSafe = Math.max(1, smsTotalEff);
      const minutesPercent = secondsUsed / secondsTotalSafe;
      const smsPercent = (subscription.usage?.smsUsed || 0) / smsTotalSafe;
      void maybeSendUsageWarningEmail(userId, {
        minutesPercent,
        smsPercent,
        userEmail: req.user.email,
        displayName: req.user.name || req.user.firstName
      });
    }

    res.json({
      planName: subscription.planId?.name || subscription.planName || "Active Plan",
      planType: subscription.planType || (unlimited ? "unlimited" : null),
      displayUnlimited: unlimited,
      minutesRemaining: unlimited ? "∞" : minutesRemaining,
      smsRemaining: unlimited ? "∞" : smsRemaining,
      status: subscription.status || "active",
      periodEnd: subscription.periodEnd,
      periodStart: subscription.periodStart,
      limits: unlimited
        ? { numbersTotal: subscription.limits?.numbersTotal || 1 }
        : subscription.limits,
      totalMinutes: unlimited ? null : (subscription.limits?.minutesTotal || 0),
      totalSMS: unlimited ? null : (subscription.limits?.smsTotal || 0),
      subscription: safeSubscription
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
      })
        .select("_id updatedAt")
        .sort({ updatedAt: -1 })
        .lean(),
      StripeInvoice.findOne({
        userId,
        status: "paid"
      })
        .select("invoiceId customerId amountPaid currency issuedAt createdAt")
        .sort({ issuedAt: -1, createdAt: -1 })
        .lean()
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
      planKey: plan.name,
      planName: plan.planName || plan.name,

      periodStart: now,
      periodEnd,

      usage: {
        minutesUsed: 0,
        smsUsed: 0,
      },

      addons: {
        minutes: 0,
        sms: 0,
      }
    });

    applyPlanSnapshotToSubscription(subscription, plan);
    await subscription.save();

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
    let planDoc = null;
    if (subscription.planId) {
      planDoc = await Plan.findById(subscription.planId);
      if (planDoc?.limits) {
        limits = planDoc.limits;
      }
    }

    // Update subscription with proper limits
    if (planDoc) {
      applyPlanSnapshotToSubscription(subscription, planDoc);
    } else {
      subscription.limits = {
        minutesTotal: limits.minutesTotal || DEFAULT_LIMITS.minutesTotal,
        smsTotal: limits.smsTotal || DEFAULT_LIMITS.smsTotal,
        numbersTotal: limits.numbersTotal || DEFAULT_LIMITS.numbersTotal
      };
    }

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
          "usage.minutesUsed": 0,
          dailySmsUsed: 0,
          dailyMinutesUsed: 0
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
