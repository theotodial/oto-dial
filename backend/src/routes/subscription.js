import express from "express";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import StripeInvoice from "../models/StripeInvoice.js";
import { applyPlanSnapshotToSubscription } from "../services/subscriptionPlanSnapshotService.js";
import { isUnlimitedSubscription } from "../services/unlimitedUsageService.js";
import {
  getCachedUserSubscription,
  invalidateUserSubscriptionCache,
  loadLatestSubscriptionDocument,
} from "../services/subscriptionService.js";

const router = express.Router();

// GET /plans and GET /addons are served by subscriptionCatalog.js (public, no auth)

/**
 * GET /api/subscription and GET /api/subscription/current
 */
const getSubscriptionHandler = async (req, res) => {
  try {
    const userId = req.userId;
    const subscription = await getCachedUserSubscription(userId);

    if (!subscription) {
      return res.json({
        planName: "No Plan",
        minutesRemaining: 0,
        smsRemaining: 0,
        status: "inactive",
        isActive: false,
        isManuallyEnabled: false,
      });
    }

    const unlimited =
      Boolean(subscription.displayUnlimited) ||
      isUnlimitedSubscription(subscription) ||
      /unlimited/i.test(String(subscription.planName || ""));

    const safeSubscription = unlimited
      ? {
          _id: subscription._id,
          planId: subscription.planId,
          planName: subscription.planName || "Unlimited",
          planType: "unlimited",
          displayUnlimited: true,
          status: subscription.status || "active",
          periodEnd: subscription.periodEnd,
          periodStart: subscription.periodStart,
          isManuallyEnabled: Boolean(subscription.isManuallyEnabled),
        }
      : subscription;

    res.json({
      planName: subscription.planName || "Active Plan",
      planType: subscription.planType || (unlimited ? "unlimited" : null),
      displayUnlimited: unlimited,
      minutesRemaining: unlimited ? "∞" : subscription.minutesRemaining,
      smsRemaining: unlimited ? "∞" : subscription.smsRemaining,
      status: subscription.status || "active",
      isActive: subscription.status === "active",
      isManuallyEnabled: Boolean(subscription.isManuallyEnabled),
      periodEnd: subscription.periodEnd,
      periodStart: subscription.periodStart,
      limits: unlimited
        ? { numbersTotal: Number(subscription.limits?.numbersTotal ?? 0) }
        : subscription.limits,
      totalMinutes: unlimited ? null : Number(subscription.limits?.minutesTotal ?? 0),
      totalSMS: unlimited ? null : Number(subscription.limits?.smsTotal ?? 0),
      subscription: safeSubscription
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
};

router.get("/", getSubscriptionHandler);
router.get("/current", getSubscriptionHandler);

/**
 * GET /api/subscription/activation-health
 * Detects paid-but-not-active mismatches for support prompts.
 */
router.get("/activation-health", async (req, res) => {
  try {
    const userId = req.userId;

    const [latestSubscription, recentPaidInvoice] = await Promise.all([
      loadLatestSubscriptionDocument(userId),
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
    const hasActiveSubscription =
      !!latestSubscription && latestSubscription.status !== "cancelled";
    const showIssueReport = hasRecentPaidInvoice && !hasActiveSubscription;

    res.json({
      success: true,
      hasActiveSubscription,
      hasRecentPaidInvoice,
      showIssueReport,
      activeSubscriptionId: latestSubscription?._id || null,
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
router.post("/buy", async (req, res) => {
  try {
    const userId = req.userId;

    const plan = await Plan.findOne({
      name: "Basic",
      active: true,
    }).lean();

    if (!plan) {
      return res.status(404).json({
        message: "Default plan not found",
        error: "Default plan not found"
      });
    }

    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(now.getDate() + 30);

    // Check for existing subscription
    const existing = await loadLatestSubscriptionDocument(userId);
    if (existing && existing.status !== "cancelled") {
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
    await invalidateUserSubscriptionCache(userId);

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
router.post("/fix", async (req, res) => {
  try {
    const userId = req.userId;

    const subscription = await loadLatestSubscriptionDocument(userId);

    if (!subscription) {
      return res.status(404).json({ error: "No subscription found" });
    }

    const needsFix =
      !subscription.limits ||
      subscription.limits.smsTotal == null ||
      subscription.limits.minutesTotal == null ||
      subscription.limits.numbersTotal == null;

    if (!needsFix) {
      return res.json({
        message: "Subscription limits are already valid",
        subscription
      });
    }

    let planDoc = null;
    if (subscription.planId) {
      planDoc = await Plan.findById(subscription.planId);
    }

    if (planDoc) {
      applyPlanSnapshotToSubscription(subscription, planDoc);
    } else {
      subscription.limits = {
        minutesTotal: Number(subscription.limits?.minutesTotal ?? 0),
        smsTotal: Number(subscription.limits?.smsTotal ?? 0),
        numbersTotal: Number(subscription.limits?.numbersTotal ?? 0)
      };
    }

    await subscription.save();
    await invalidateUserSubscriptionCache(userId);

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
router.post("/cancel", async (req, res) => {
  try {
    const userId = req.userId;

    const subscription = await loadLatestSubscriptionDocument(userId);

    if (!subscription || subscription.status === "cancelled") {
      return res.status(404).json({ error: "No subscription found" });
    }

    // Mark subscription as cancelled but keep it active until periodEnd
    // This ensures user keeps access until the end of the billing cycle
    subscription.status = "cancelled";
    await subscription.save();
    await invalidateUserSubscriptionCache(userId);

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
router.post("/reset-usage", async (req, res) => {
  try {
    const userId = req.userId;

    const latestSubscription = await loadLatestSubscriptionDocument(userId);

    if (!latestSubscription) {
      return res.status(404).json({ error: "No subscription found" });
    }

    const subscription = await Subscription.findByIdAndUpdate(
      latestSubscription._id,
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

    console.log(`✅ Reset usage for user ${userId}`);
    await invalidateUserSubscriptionCache(userId);

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
