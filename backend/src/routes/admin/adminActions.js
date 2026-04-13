import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Plan from "../../models/Plan.js";
import getTelnyxClient from "../../services/telnyxService.js";
import Stripe from "stripe";
import { getCanonicalPlanPriceId } from "../../config/stripeCatalog.js";
import {
  applyPlanSnapshotToSubscription
} from "../../services/subscriptionPlanSnapshotService.js";
import { getServerDayKey } from "../../services/unlimitedUsageService.js";
import {
  applyLoadedCreditsToSubscription,
  getActiveAddonAmounts,
  parseLoadedCreditsInput
} from "../../services/subscriptionAddonCreditService.js";
import { applyUserEntitlementsForPlan } from "../../services/userPlanEntitlementsService.js";

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/** Same statuses as admin user details — change-plan must find these rows, not only `active`. */
const ADMIN_MANAGED_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "pending_activation",
  "past_due",
  "incomplete"
];

function findAdminManagedSubscription(userId) {
  return Subscription.findOne({
    userId,
    status: { $in: ADMIN_MANAGED_SUBSCRIPTION_STATUSES }
  }).sort({ updatedAt: -1, createdAt: -1 });
}

function parseAdminPeriodEnd(body, now = new Date()) {
  let raw = body?.periodEnd ?? body?.subscriptionPeriodEnd;
  if (typeof raw === "string") {
    raw = raw.trim();
  }
  const fallback = new Date(now);
  fallback.setMonth(fallback.getMonth() + 1);
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return fallback;
  }
  if (d.getTime() <= now.getTime()) {
    return fallback;
  }
  return d;
}

/**
 * Core assign: cancel prior Mongo rows, optional Stripe, create Subscription + link user.
 * Used by POST /subscription/assign and as fallback from change-plan when no row exists.
 */
async function performAdminAssignSubscription({ userId, planId, loadedCreditsInput, body }) {
  const user = await User.findById(userId);
  if (!user) {
    return { ok: false, status: 404, error: "User not found" };
  }

  const plan = await Plan.findById(planId);
  if (!plan || !plan.active) {
    return { ok: false, status: 404, error: "Plan not found or inactive" };
  }

  const effectivePlanPriceId = getCanonicalPlanPriceId(plan);
  const hasStripePlanConfig = Boolean(plan.stripeProductId && effectivePlanPriceId);
  const shouldUseStripe = Boolean(stripe && hasStripePlanConfig);

  if (hasStripePlanConfig && plan.stripePriceId !== effectivePlanPriceId) {
    plan.stripePriceId = effectivePlanPriceId;
    await plan.save();
  }

  await Subscription.updateMany({ userId }, { status: "cancelled" });

  let stripeSubscriptionId = null;
  if (shouldUseStripe && user.stripeCustomerId) {
    try {
      const existingSubscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: "active"
      });

      for (const sub of existingSubscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
      }

      const stripeSubscription = await stripe.subscriptions.create({
        customer: user.stripeCustomerId,
        items: [{ price: effectivePlanPriceId }],
        metadata: {
          userId: userId.toString(),
          planId: planId.toString(),
          planName: plan.name
        }
      });

      stripeSubscriptionId = stripeSubscription.id;
      console.log(`✅ Created Stripe subscription ${stripeSubscriptionId} for user ${userId}`);
    } catch (stripeErr) {
      console.error("Stripe subscription creation error:", stripeErr);
    }
  } else if (!user.stripeCustomerId && shouldUseStripe) {
    try {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: userId.toString(),
          planId: planId.toString()
        }
      });
      user.stripeCustomerId = customer.id;
      await user.save();

      const stripeSubscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: effectivePlanPriceId }],
        metadata: {
          userId: userId.toString(),
          planId: planId.toString(),
          planName: plan.name
        }
      });

      stripeSubscriptionId = stripeSubscription.id;
      console.log(`✅ Created Stripe customer and subscription for user ${userId}`);
    } catch (stripeErr) {
      console.error("Stripe customer/subscription creation error:", stripeErr);
    }
  }

  const now = new Date();
  const periodEnd = parseAdminPeriodEnd(body, now);

  const planLimits = plan?.limits || {};
  const minutesTotal = Number(planLimits.minutesTotal || 0);
  const smsTotal = Number(planLimits.smsTotal || 0);
  const numbersTotal = Number(planLimits.numbersTotal || 0);
  if (!Number.isFinite(minutesTotal) || !Number.isFinite(smsTotal) || !Number.isFinite(numbersTotal)) {
    return {
      ok: false,
      status: 400,
      error:
        "Plan limits are invalid. Please edit the plan to include minutesTotal, smsTotal, and numbersTotal."
    };
  }

  const subscription = await Subscription.create({
    userId,
    planId,
    stripeSubscriptionId: stripeSubscriptionId,
    stripePriceId: shouldUseStripe ? effectivePlanPriceId : null,
    planKey: plan.name,
    planName: plan.planName || plan.name,
    status: "active",
    periodStart: now,
    periodEnd,
    usage: {
      minutesUsed: 0,
      smsUsed: 0
    },
    limits: {
      minutesTotal,
      smsTotal,
      numbersTotal
    },
    addons: {
      minutes: 0,
      sms: 0
    },
    ratePerMinute: 0.0065,
    usageWindowDateKey: getServerDayKey()
  });

  applyPlanSnapshotToSubscription(subscription, plan);

  if (loadedCreditsInput.hasChanges) {
    applyLoadedCreditsToSubscription(subscription, loadedCreditsInput);
  }

  await subscription.save();

  await User.findByIdAndUpdate(userId, {
    $set: {
      activeSubscriptionId: subscription._id,
      currentPlanId: planId,
      lastSubscriptionSyncAt: new Date(),
    },
    $unset: {
      subscriptionActive: "",
      currentSubscriptionLimits: "",
      plan: "",
      minutesUsed: "",
      smsUsed: "",
    },
  });

  await applyUserEntitlementsForPlan(userId, plan);

  return {
    ok: true,
    subscription,
    loadedCredits: getActiveAddonAmounts(subscription)
  };
}

/**
 * ================================
 * SUBSCRIPTION CONTROLS
 * ================================
 */

/**
 * POST /api/admin/actions/subscription/assign
 * Assign subscription to user
 * Creates Stripe subscription if Stripe is configured
 * Optional body: periodEnd | subscriptionPeriodEnd (ISO) — billing period end
 */
router.post("/subscription/assign", requireAdmin, async (req, res) => {
  try {
    const { userId, planId } = req.body;
    let loadedCreditsInput;

    try {
      loadedCreditsInput = parseLoadedCreditsInput(req.body);
    } catch (validationErr) {
      return res.status(400).json({
        success: false,
        error: validationErr.message
      });
    }

    if (!userId || !planId) {
      return res.status(400).json({
        success: false,
        error: "userId and planId are required"
      });
    }

    const result = await performAdminAssignSubscription({
      userId,
      planId,
      loadedCreditsInput,
      body: req.body
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: "Subscription assigned successfully",
      subscription: result.subscription,
      loadedCredits: result.loadedCredits
    });
  } catch (err) {
    console.error("Assign subscription error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to assign subscription",
      details: err.message
    });
  }
});

/**
 * POST /api/admin/actions/subscription/cancel
 * Cancel user subscription
 */
router.post("/subscription/cancel", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const result = await Subscription.updateMany(
      { userId, status: "active" },
      { status: "cancelled" }
    );

    res.json({
      success: true,
      message: "Subscription cancelled",
      updated: result.modifiedCount
    });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to cancel subscription"
    });
  }
});

/**
 * POST /api/admin/actions/subscription/resume
 * Resume cancelled subscription
 */
router.post("/subscription/resume", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const subscription = await Subscription.findOne({
      userId,
      status: "cancelled"
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "No cancelled subscription found"
      });
    }

    subscription.status = "active";
    await subscription.save();

    res.json({
      success: true,
      message: "Subscription resumed",
      subscription
    });
  } catch (err) {
    console.error("Resume subscription error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to resume subscription"
    });
  }
});

/**
 * POST /api/admin/actions/subscription/change-plan
 * Change user's subscription plan
 * Updates Stripe subscription if exists
 */
router.post("/subscription/change-plan", requireAdmin, async (req, res) => {
  try {
    const { userId, planId } = req.body;
    let loadedCreditsInput;

    try {
      loadedCreditsInput = parseLoadedCreditsInput(req.body);
    } catch (validationErr) {
      return res.status(400).json({
        success: false,
        error: validationErr.message
      });
    }

    if (!userId || !planId) {
      return res.status(400).json({
        success: false,
        error: "userId and planId are required"
      });
    }

    const plan = await Plan.findById(planId);
    if (!plan || !plan.active) {
      return res.status(404).json({
        success: false,
        error: "Plan not found or inactive"
      });
    }

    let subscription = await findAdminManagedSubscription(userId);

    if (!subscription) {
      const assignResult = await performAdminAssignSubscription({
        userId,
        planId,
        loadedCreditsInput,
        body: req.body
      });
      if (!assignResult.ok) {
        return res.status(assignResult.status).json({
          success: false,
          error: assignResult.error
        });
      }
      return res.json({
        success: true,
        message:
          "Subscription assigned successfully (no existing subscription row; created new)",
        subscription: assignResult.subscription,
        loadedCredits: assignResult.loadedCredits
      });
    }

    const effectivePlanPriceId = getCanonicalPlanPriceId(plan);
    // Must match assign: Stripe only when product id and canonical price both exist.
    const stripeBillable = Boolean(plan.stripeProductId && effectivePlanPriceId);

    if (stripeBillable) {
      if (plan.stripePriceId !== effectivePlanPriceId) {
        plan.stripePriceId = effectivePlanPriceId;
        await plan.save();
      }

      if (stripe && subscription.stripeSubscriptionId) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            items: [{
              id: stripeSub.items.data[0].id,
              price: effectivePlanPriceId
            }],
            metadata: {
              userId: userId.toString(),
              planId: planId.toString(),
              planName: plan.name
            }
          });

          console.log(`✅ Updated Stripe subscription ${subscription.stripeSubscriptionId} to plan ${plan.name}`);
        } catch (stripeErr) {
          console.error("Stripe subscription update error:", stripeErr);
        }
      }

      subscription.stripePriceId = effectivePlanPriceId;
    } else {
      if (stripe && subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          console.log(`✅ Cancelled Stripe subscription ${subscription.stripeSubscriptionId} (Mongo-only plan ${plan.name})`);
        } catch (stripeErr) {
          console.error("Stripe subscription cancel error (Mongo-only plan change):", stripeErr);
        }
      }
      subscription.stripeSubscriptionId = null;
      subscription.stripePriceId = null;
    }

    subscription.planId = planId;
    applyPlanSnapshotToSubscription(subscription, plan);

    subscription.status = "active";

    const periodRaw =
      req.body?.periodEnd ?? req.body?.subscriptionPeriodEnd;
    const hasExplicitPeriod =
      periodRaw !== undefined &&
      periodRaw !== null &&
      String(periodRaw).trim() !== "";
    if (hasExplicitPeriod) {
      subscription.periodEnd = parseAdminPeriodEnd(req.body, new Date());
    }

    if (loadedCreditsInput.hasChanges) {
      applyLoadedCreditsToSubscription(subscription, loadedCreditsInput);
    }

    await subscription.save();

    await applyUserEntitlementsForPlan(userId, plan);

    res.json({
      success: true,
      message: "Subscription plan changed successfully",
      subscription,
      loadedCredits: getActiveAddonAmounts(subscription)
    });
  } catch (err) {
    console.error("Change plan error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to change subscription plan",
      details: err.message
    });
  }
});

/**
 * POST /api/admin/actions/subscription/load-credits
 * Add custom SMS/minutes credits with optional expiry dates.
 */
router.post("/subscription/load-credits", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    let loadedCreditsInput;

    try {
      loadedCreditsInput = parseLoadedCreditsInput(req.body);
    } catch (validationErr) {
      return res.status(400).json({
        success: false,
        error: validationErr.message
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    if (!loadedCreditsInput.hasChanges) {
      return res.status(400).json({
        success: false,
        error: "Provide loadedSms/loadedMinutes and/or expiry date values"
      });
    }

    const subscription = await findAdminManagedSubscription(userId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "No active subscription found"
      });
    }

    const loadedCredits = applyLoadedCreditsToSubscription(
      subscription,
      loadedCreditsInput
    );
    await subscription.save();

    res.json({
      success: true,
      message: "Credits loaded successfully",
      subscription,
      loadedCredits
    });
  } catch (err) {
    console.error("Load credits error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to load credits"
    });
  }
});

/**
 * POST /api/admin/actions/subscription/override-usage
 * Admin override for usage counters and hard limits
 */
router.post("/subscription/override-usage", requireAdmin, async (req, res) => {
  try {
    const {
      userId,
      monthlySmsLimit,
      monthlyMinutesLimit,
      dailySmsLimit,
      dailyMinutesLimit,
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const subscription = await findAdminManagedSubscription(userId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "No active subscription found"
      });
    }

    const setUpdate = {};

    const setNumberIfProvided = (field, value, { minimum = 0, toSeconds = false } = {}) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < minimum) {
        throw new Error(`Invalid value for ${field}`);
      }
      setUpdate[field] = toSeconds ? Math.round(parsed * 60) : Math.round(parsed);
    };

    setNumberIfProvided("monthlySmsLimit", monthlySmsLimit);
    setNumberIfProvided("monthlyMinutesLimit", monthlyMinutesLimit);
    setNumberIfProvided("dailySmsLimit", dailySmsLimit);
    setNumberIfProvided("dailyMinutesLimit", dailyMinutesLimit);

    if (Object.keys(setUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one limit override value is required (usage is derived from SMS/Call records)"
      });
    }

    await Subscription.updateOne(
      { _id: subscription._id },
      { $set: setUpdate }
    );

    const updated = await Subscription.findById(subscription._id);

    res.json({
      success: true,
      message: "Subscription usage overrides applied",
      subscription: updated
    });
  } catch (err) {
    console.error("Override usage error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to apply usage overrides"
    });
  }
});

/**
 * POST /api/admin/actions/subscription/set-trial
 * Set user subscription to trial (free, limited time)
 */
router.post("/subscription/set-trial", requireAdmin, async (req, res) => {
  try {
    const { userId, trialDays = 7 } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Find or create trial plan
    let trialPlan = await Plan.findOne({ name: "Trial" });
    if (!trialPlan) {
      trialPlan = await Plan.create({
        type: "trial",
        name: "Trial",
        planName: "Trial",
        price: 0,
        limits: {
          minutesTotal: 100,
          smsTotal: 50,
          numbersTotal: 1
        }
      });
    }

    // Cancel existing subscriptions
    await Subscription.updateMany(
      { userId },
      { status: "cancelled" }
    );

    // Create trial subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + trialDays);

    const subscription = await Subscription.create({
      userId,
      planId: trialPlan._id,
      planKey: trialPlan.name,
      planName: trialPlan.planName || trialPlan.name,
      status: "active",
      periodStart: now,
      periodEnd,
      usage: {
        minutesUsed: 0,
        smsUsed: 0
      },
      limits: {
        minutesTotal: Number(trialPlan?.limits?.minutesTotal || 0),
        smsTotal: Number(trialPlan?.limits?.smsTotal || 0),
        numbersTotal: Number(trialPlan?.limits?.numbersTotal || 1)
      },
      addons: {
        minutes: 0,
        sms: 0
      },
      ratePerMinute: 0.0065,
      usageWindowDateKey: getServerDayKey()
    });

    applyPlanSnapshotToSubscription(subscription, trialPlan);
    await subscription.save();

    await applyUserEntitlementsForPlan(userId, trialPlan);

    res.json({
      success: true,
      message: `Trial subscription created for ${trialDays} days`,
      subscription,
      expiresAt: periodEnd
    });
  } catch (err) {
    console.error("Set trial error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to set trial subscription",
      details: err.message
    });
  }
});

/**
 * ================================
 * USER PASSWORD CONTROLS
 * ================================
 */

/**
 * POST /api/admin/actions/user/reset-password
 * Reset user password (admin-only)
 */
router.post("/user/reset-password", requireAdmin, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "userId and newPassword are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Update password (plain text as per current schema)
    // TODO: Consider migrating to bcrypt for security
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully",
      userId: user._id
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to reset password",
      details: err.message
    });
  }
});

/**
 * POST /api/admin/actions/user/generate-password
 * Generate a secure random password for user
 */
router.post("/user/generate-password", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Generate secure random password (12 characters)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let newPassword = "";
    for (let i = 0; i < 12; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password generated successfully",
      userId: user._id,
      newPassword: newPassword, // Return password so admin can share with user
      warning: "Store this password securely - it will not be shown again"
    });
  } catch (err) {
    console.error("Generate password error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to generate password",
      details: err.message
    });
  }
});

/**
 * ================================
 * TELNYX CONTROLS
 * ================================
 */

/**
 * POST /api/admin/actions/telnyx/assign-number
 * Assign phone number to user
 */
router.post("/telnyx/assign-number", requireAdmin, async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;

    if (!userId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "userId and phoneNumber are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Find or create phone number record
    let phoneNumberRecord = await PhoneNumber.findOne({ phoneNumber });

    if (phoneNumberRecord) {
      // Reassign existing number
      phoneNumberRecord.userId = userId;
      phoneNumberRecord.status = "active";
      await phoneNumberRecord.save();
    } else {
      // Create new record (number should already exist in Telnyx)
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({
          success: false,
          error: "Telnyx not configured"
        });
      }

      // Get number details from Telnyx
      let telnyxNumberId = null;
      let monthlyCost = 0;
      let oneTimeFees = 0;
      let carrierGroup = null;
      
      try {
        const telnyxNumber = await telnyx.phoneNumbers.retrieve(phoneNumber);
        telnyxNumberId = telnyxNumber.data.id;
        monthlyCost = telnyxNumber.data.monthly_cost || telnyxNumber.data.monthly_rate || 0;
        oneTimeFees = telnyxNumber.data.one_time_cost || 0;
        carrierGroup = telnyxNumber.data.carrier?.group || telnyxNumber.data.carrier_group || null;
      } catch (err) {
        console.warn("Could not fetch Telnyx number details:", err.message);
      }

      phoneNumberRecord = await PhoneNumber.create({
        userId,
        phoneNumber,
        telnyxPhoneNumberId: telnyxNumberId || phoneNumber,
        status: "active",
        messagingProfileId: user.messagingProfileId,
        monthlyCost: monthlyCost,
        oneTimeFees: oneTimeFees,
        carrierGroup: carrierGroup,
        purchaseDate: new Date()
      });
    }

    res.json({
      success: true,
      message: "Phone number assigned successfully",
      phoneNumber: phoneNumberRecord
    });
  } catch (err) {
    console.error("Assign number error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to assign phone number"
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/buy-number
 * Buy new number for user
 */
router.post("/telnyx/buy-number", requireAdmin, async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;

    if (!userId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "userId and phoneNumber are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    const telnyx = getTelnyxClient();
    if (!telnyx) {
      return res.status(500).json({
        success: false,
        error: "Telnyx not configured"
      });
    }

    // Purchase number from Telnyx
    const order = await telnyx.numberOrders.create({
      phone_numbers: [{ phone_number: phoneNumber }]
    });

    // Create phone number record
    const phoneNumberRecord = await PhoneNumber.create({
      userId,
      phoneNumber,
      telnyxPhoneNumberId: order.data.id,
      status: "active",
      messagingProfileId: user.messagingProfileId
    });

    // Attach to messaging profile if exists
    if (user.messagingProfileId) {
      await telnyx.messaging.messagingProfiles.phoneNumbers.create(
        user.messagingProfileId,
        { phone_number: phoneNumber }
      );
    }

    res.json({
      success: true,
      message: "Phone number purchased successfully",
      phoneNumber: phoneNumberRecord
    });
  } catch (err) {
    console.error("Buy number error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to buy phone number",
      details: err.message
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/release-number
 * Release phone number from user
 */
router.post("/telnyx/release-number", requireAdmin, async (req, res) => {
  try {
    const { phoneNumberId } = req.body;

    if (!phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: "phoneNumberId is required"
      });
    }

    const phoneNumber = await PhoneNumber.findById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: "Phone number not found"
      });
    }

    // Mark as released in database
    phoneNumber.status = "released";
    await phoneNumber.save();

    // Optionally release from Telnyx (uncomment if needed)
    // const telnyx = getTelnyxClient();
    // if (telnyx) {
    //   await telnyx.phoneNumbers.delete(phoneNumber.phoneNumber);
    // }

    res.json({
      success: true,
      message: "Phone number released successfully"
    });
  } catch (err) {
    console.error("Release number error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to release phone number"
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/block-calls
 * Block outbound calls for user
 */
router.post("/telnyx/block-calls", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    // Suspend user (which blocks calls via usage guards)
    await User.findByIdAndUpdate(userId, { status: "suspended" });
    await Subscription.updateMany(
      { userId },
      { status: "suspended" }
    );

    res.json({
      success: true,
      message: "Outbound calls blocked for user"
    });
  } catch (err) {
    console.error("Block calls error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to block calls"
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/block-sms
 * Block SMS for user
 */
router.post("/telnyx/block-sms", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    // Suspend user (which blocks SMS via usage guards)
    await User.findByIdAndUpdate(userId, { status: "suspended" });
    await Subscription.updateMany(
      { userId },
      { status: "suspended" }
    );

    res.json({
      success: true,
      message: "SMS blocked for user"
    });
  } catch (err) {
    console.error("Block SMS error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to block SMS"
    });
  }
});

export default router;
