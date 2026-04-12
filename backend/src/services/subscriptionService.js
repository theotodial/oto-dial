import Subscription from "../models/Subscription.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Plan from "../models/Plan.js";
import { getActiveAddonAmounts } from "./subscriptionAddonCreditService.js";
import {
  cacheKeys,
  deleteCachedKey,
  getCachedJson,
  setCachedJson,
} from "./cache.service.js";

// Default limits if subscription doesn't have them set
const DEFAULT_LIMITS = {
  minutesTotal: 2500,
  smsTotal: 200,
  numbersTotal: 1
};

const SUBSCRIPTION_CACHE_TTL_SECONDS = 60;

export async function loadUserSubscription(userId) {
  if (!userId) return null;

  let subscription = await Subscription.findOne({
    userId,
    status: "active",
  }).lean();

  if (!subscription) {
    return null;
  }

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

  return {
    id: subscription._id,
    active: true,
    status: subscription.status || "active",
    planType: subscription.planType || null,
    planName: subscription.planName || subscription.planType || "Active Plan",
    displayUnlimited: Boolean(subscription.displayUnlimited),
    planId: subscription.planId,
    minutesRemaining,
    smsRemaining,
    limits: subscription.limits,
    usage: subscription.usage,
    dailySmsUsed: subscription.dailySmsUsed || 0,
    dailyMinutesUsed: subscription.dailyMinutesUsed || 0,
    periodStart: subscription.periodStart || null,
    periodEnd: subscription.periodEnd || null,
    numbers: numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      id: n._id,
    })),
  };
}

export async function getCachedUserSubscription(userId) {
  if (!userId) return null;

  const key = cacheKeys.subscription(userId);
  const cached = await getCachedJson(key);
  if (cached !== null) {
    return cached;
  }

  const subscription = await loadUserSubscription(userId);
  await setCachedJson(key, subscription, SUBSCRIPTION_CACHE_TTL_SECONDS);
  return subscription;
}

export async function invalidateUserSubscriptionCache(userId) {
  if (!userId) return;
  await deleteCachedKey(cacheKeys.subscription(userId));
}
