import mongoose from "mongoose";
import Subscription from "../models/Subscription.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Plan from "../models/Plan.js";
import { getActiveAddonAmounts } from "./subscriptionAddonCreditService.js";
import { getServerDayKey, isUnlimitedSubscription } from "./unlimitedUsageService.js";
import {
  applyCustomPackageToSubscription,
  getActiveCustomPackage,
} from "./customPackageService.js";
import {
  cacheKeys,
  deleteCachedKey,
  setCachedJson,
} from "./cache.service.js";
import User from "../models/User.js";

// Default limits if subscription doesn't have them set
const DEFAULT_LIMITS = {
  minutesTotal: 2500,
  smsTotal: 200,
  numbersTotal: 1
};

const SUBSCRIPTION_CACHE_TTL_SECONDS = 60;

/**
 * Same idea as stripeSubscriptionService when resolving a user's row: checkout creates
 * `pending_activation` before webhooks flip `active`. Querying only `active` hides real MongoDB rows.
 */
const BOOTSTRAP_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "pending_activation",
  "past_due",
  "incomplete",
];

/** UI + bootstrap: treat as "has a subscription" (dialer/API may still enforce billing elsewhere). */
function subscriptionUiEntitled(status) {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "pending_activation" ||
    status === "past_due"
  );
}

export function buildEffectiveUsage({ subscription, customPackage }) {
  const now = new Date();
  const customActive =
    customPackage &&
    customPackage.active === true &&
    (!customPackage.expiresAt || new Date(customPackage.expiresAt) > now);

  if (customActive) {
    return {
      smsRemaining: Number(customPackage.smsAllowed ?? 0),
      minutesRemaining: Number(customPackage.minutesAllowed ?? 0),
      isSmsEnabled: customPackage.isSmsEnabled !== false,
      isCallEnabled: customPackage.isCallEnabled !== false,
      source: "customPackage",
      limits: {
        smsTotal: Number(customPackage.smsAllowed ?? 0),
        minutesTotal: Number(customPackage.minutesAllowed ?? 0),
        numbersTotal: Number(subscription?.limits?.numbersTotal ?? 1),
      },
      usage: {
        smsUsed: 0,
        minutesUsed: 0,
      },
      active: true,
      status: "custom_override",
    };
  }

  if (subscription) {
    return {
      smsRemaining: Number(subscription.smsRemaining ?? 0),
      minutesRemaining: Number(subscription.minutesRemaining ?? 0),
      isSmsEnabled: true,
      isCallEnabled: true,
      source: "subscription",
      limits: subscription.limits || null,
      usage: subscription.usage || null,
      active: Boolean(subscription.active),
      status: subscription.status || "active",
    };
  }

  return {
    smsRemaining: 0,
    minutesRemaining: 0,
    isSmsEnabled: false,
    isCallEnabled: false,
    source: "none",
    limits: null,
    usage: null,
    active: false,
    status: "inactive",
  };
}

function buildFallbackUserSubscription(userDoc) {
  if (!userDoc) return null;
  const hasUserLevelPlan =
    userDoc.subscriptionActive === true ||
    Boolean(userDoc.activeSubscriptionId) ||
    Boolean(userDoc.currentPlanId);

  if (!hasUserLevelPlan) {
    return null;
  }

  const minutesTotal = Number(userDoc.currentSubscriptionLimits?.minutesTotal ?? 0);
  const smsTotal = Number(userDoc.currentSubscriptionLimits?.smsTotal ?? 0);
  const numbersTotal = Number(userDoc.currentSubscriptionLimits?.numbersTotal ?? 0);

  return {
    id: userDoc.activeSubscriptionId || userDoc._id,
    _id: userDoc.activeSubscriptionId || userDoc._id,
    active: true,
    status: "active",
    planType: "admin_assigned",
    planName: userDoc.plan || "Admin Assigned Plan",
    plan: userDoc.plan || "Admin Assigned Plan",
    isUnlimited: false,
    displayUnlimited: false,
    minutesRemaining: minutesTotal,
    smsRemaining: smsTotal,
    limits: {
      minutesTotal,
      smsTotal,
      numbersTotal,
    },
    usage: {
      minutesUsed: 0,
      smsUsed: 0,
    },
    periodStart: null,
    periodEnd: null,
    numbers: [],
  };
}

async function resetDailyUsageWindowIfNeeded(subscription) {
  if (!subscription?._id) return subscription;

  const dayKey = getServerDayKey();
  if (subscription.usageWindowDateKey === dayKey) {
    return subscription;
  }

  await Subscription.updateOne(
    {
      _id: subscription._id,
      usageWindowDateKey: { $ne: dayKey }
    },
    {
      $set: {
        usageWindowDateKey: dayKey,
        dailySmsUsed: 0,
        dailyMinutesUsed: 0,
        lastUsageReset: new Date()
      }
    }
  );

  return {
    ...subscription,
    usageWindowDateKey: dayKey,
    dailySmsUsed: 0,
    dailyMinutesUsed: 0,
    lastUsageReset: new Date()
  };
}

export async function loadUserSubscription(userId) {
  if (!userId) return null;

  console.log("[subscription] DB lookup start:", {
    userId: String(userId),
    statuses: BOOTSTRAP_SUBSCRIPTION_STATUSES,
  });

  let subscription = await Subscription.findOne({
    userId,
    status: { $in: BOOTSTRAP_SUBSCRIPTION_STATUSES },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const userDoc = await User.findById(userId)
    .select("subscriptionActive activeSubscriptionId currentPlanId currentSubscriptionLimits plan")
    .lean();

  if (!subscription) {
    const customPackageOnly = await getActiveCustomPackage(userId);
    if (customPackageOnly) {
      console.log("[subscription] Custom package override without subscription:", {
        userId: String(userId),
        customPackageId: String(customPackageOnly._id),
      });
      return applyCustomPackageToSubscription(buildFallbackUserSubscription(userDoc), customPackageOnly);
    }

    const fallbackSubscription = buildFallbackUserSubscription(userDoc);
    if (fallbackSubscription) {
      console.log("[subscription] Using user-level fallback subscription state:", {
        userId: String(userId),
        activeSubscriptionId: String(userDoc?.activeSubscriptionId || ""),
        currentPlanId: String(userDoc?.currentPlanId || ""),
      });
      return fallbackSubscription;
    }
    console.warn("[subscription] No subscription found in DB:", {
      userId: String(userId),
      statuses: BOOTSTRAP_SUBSCRIPTION_STATUSES,
    });
    return null;
  }

  console.log("[subscription] DB result:", {
    userId: String(userId),
    subscriptionId: String(subscription._id),
    status: subscription.status,
    planName: subscription.planName || null,
    planType: subscription.planType || null,
  });

  subscription = await resetDailyUsageWindowIfNeeded(subscription);

  // Fix subscriptions with missing or zero limits
  const limitsNeedFix = !subscription.limits || 
    !subscription.limits.smsTotal || 
    !subscription.limits.minutesTotal;

  if (limitsNeedFix) {
    
    // Try to get limits from plan
    let limits = DEFAULT_LIMITS;
    if (subscription.planId) {
      const plan = await Plan.findById(subscription.planId).lean();
      if (plan?.limits) {
        limits = plan.limits;
      }
    }

    // Update the subscription with proper limits
    await Subscription.updateOne(
      { _id: subscription._id },
      {
        $set: {
          limits: {
            minutesTotal: subscription.limits?.minutesTotal || limits.minutesTotal,
            smsTotal: subscription.limits?.smsTotal || limits.smsTotal,
            numbersTotal: subscription.limits?.numbersTotal || limits.numbersTotal
          }
        }
      }
    );

    // Reload subscription
    subscription = await Subscription.findById(subscription._id).lean();
  }

  const numbers = await PhoneNumber.find({
    userId,
    status: "active",
  })
    .select("phoneNumber")
    .lean();

  const smsTotal = subscription.limits?.smsTotal || DEFAULT_LIMITS.smsTotal;
  const minutesTotal = subscription.limits?.minutesTotal || DEFAULT_LIMITS.minutesTotal;
  const activeAddons = getActiveAddonAmounts(subscription);
  const smsAddons = activeAddons.smsActive;
  const minutesAddons = activeAddons.minutesActive;
  const smsUsed = subscription.usage?.smsUsed || 0;
  
  // minutesUsed field stores SECONDS internally
  const secondsUsed = subscription.usage?.minutesUsed || 0;
  
  // Convert limits from minutes to seconds for comparison
  const secondsTotal = (minutesTotal + minutesAddons) * 60;
  const secondsRemaining = Math.max(0, secondsTotal - secondsUsed);
  
  // Convert remaining seconds back to minutes for display (with decimals)
  const minutesRemaining = secondsRemaining / 60;
  const smsRemaining = Math.max(0, smsTotal + smsAddons - smsUsed);
  const unlimited =
    Boolean(subscription.displayUnlimited) ||
    isUnlimitedSubscription(subscription) ||
    /unlimited/i.test(String(subscription.planName || ""));

  const rawStatus = subscription.status || "active";
  const customPackage = await getActiveCustomPackage(userId);

  const baseSubscription = {
    id: subscription._id,
    _id: subscription._id,
    active: subscriptionUiEntitled(rawStatus),
    status: rawStatus,
    planType: subscription.planType || null,
    planName: subscription.planName || subscription.planType || "Active Plan",
    plan: subscription.planName || subscription.planType || "Active Plan",
    isUnlimited: unlimited,
    displayUnlimited: Boolean(subscription.displayUnlimited),
    planId: subscription.planId,
    minutesRemaining,
    smsRemaining,
    limits: subscription.limits,
    usage: subscription.usage,
    dailySmsUsed: subscription.dailySmsUsed || 0,
    dailyMinutesUsed: subscription.dailyMinutesUsed || 0,
    usageWindowDateKey: subscription.usageWindowDateKey || getServerDayKey(),
    periodStart: subscription.periodStart || null,
    periodEnd: subscription.periodEnd || null,
    numbers: numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      id: n._id,
    })),
  };

  return applyCustomPackageToSubscription(baseSubscription, customPackage);
}

export async function getCachedUserSubscription(userId) {
  if (!userId) return null;
  // Debug phase: always trust MongoDB over cache reads to avoid stale null/old rows.
  const subscription = await loadUserSubscription(userId);
  const key = cacheKeys.subscription(userId);
  if (subscription) {
    await setCachedJson(key, subscription, SUBSCRIPTION_CACHE_TTL_SECONDS);
  } else {
    await deleteCachedKey(key);
  }
  return subscription;
}

export async function invalidateUserSubscriptionCache(userId) {
  if (!userId) return;
  await deleteCachedKey(cacheKeys.subscription(userId));
}

export function buildPublicSubscriptionState(subscription) {
  if (!subscription) {
    return {
      active: false,
      status: "inactive",
      plan: "No Plan",
      planName: "No Plan",
      minutesRemaining: 0,
      smsRemaining: 0,
      isUnlimited: false,
      displayUnlimited: false,
      periodStart: null,
      periodEnd: null
    };
  }

  return {
    active: Boolean(subscription.active),
    status: subscription.status || "active",
    plan: subscription.planName || subscription.planType || "Active Plan",
    planName: subscription.planName || subscription.planType || "Active Plan",
    planType: subscription.planType || null,
    minutesRemaining: subscription.isUnlimited ? "∞" : Number(subscription.minutesRemaining ?? 0),
    smsRemaining: subscription.isUnlimited ? "∞" : Number(subscription.smsRemaining ?? 0),
    isUnlimited: Boolean(subscription.isUnlimited),
    displayUnlimited: Boolean(subscription.displayUnlimited || subscription.isUnlimited),
    isSmsEnabled: subscription.isSmsEnabled !== false,
    isCallEnabled: subscription.isCallEnabled !== false,
    source: subscription.source || "subscription",
    limits: subscription.limits || null,
    usage: subscription.usage || null,
    periodStart: subscription.periodStart || null,
    periodEnd: subscription.periodEnd || null
  };
}
