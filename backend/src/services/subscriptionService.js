import Subscription from "../models/Subscription.js";
import PhoneNumber from "../models/PhoneNumber.js";
import { getActiveAddonAmounts } from "./subscriptionAddonCreditService.js";
import { computeUsage } from "./usageComputationService.js";
import { getServerDayKey, isUnlimitedSubscription } from "./unlimitedUsageService.js";
import {
  applyCustomPackageToSubscription,
  getActiveCustomPackage,
  isCustomPackageActive,
} from "./customPackageService.js";
import {
  cacheKeys,
  deleteCachedKey,
  setCachedJson,
} from "./cache.service.js";

const SUBSCRIPTION_CACHE_TTL_SECONDS = 60;

export function buildEffectiveUsage({ subscription, customPackage, activityUsage = null }) {
  if (subscription) {
    const smsUsed = Math.max(
      0,
      Number(
        activityUsage != null
          ? activityUsage.smsUsed
          : subscription.smsUsed ?? 0
      )
    );
    const minutesUsed = Math.max(
      0,
      Number(
        activityUsage != null
          ? activityUsage.minutesUsed
          : subscription.minutesUsed ?? 0
      )
    );
    const smsLimit = Math.max(
      0,
      Number(subscription.smsLimit ?? subscription.limits?.smsTotal ?? 0)
    );
    const minutesLimit = Math.max(
      0,
      Number(subscription.minutesLimit ?? subscription.limits?.minutesTotal ?? 0)
    );

    return {
      smsUsed,
      minutesUsed,
      smsRemaining: Math.max(
        0,
        Number(subscription.smsRemaining ?? smsLimit - smsUsed)
      ),
      minutesRemaining: Math.max(
        0,
        Number(subscription.minutesRemaining ?? minutesLimit - minutesUsed)
      ),
      smsLimit,
      minutesLimit,
      isSmsEnabled: subscription.isSmsEnabled !== false,
      isCallEnabled: subscription.isCallEnabled !== false,
      source: subscription.source || "subscription",
    };
  }

  if (isCustomPackageActive(customPackage)) {
    const smsUsed = Math.max(0, Number(activityUsage?.smsUsed ?? 0));
    const minutesUsed = Math.max(0, Number(activityUsage?.minutesUsed ?? 0));
    const smsLimit = Math.max(0, Number(customPackage.smsAllowed ?? 0));
    const minutesLimit = Math.max(0, Number(customPackage.minutesAllowed ?? 0));
    return {
      smsUsed,
      minutesUsed,
      smsRemaining: Math.max(0, smsLimit - smsUsed),
      minutesRemaining: Math.max(0, minutesLimit - minutesUsed),
      smsLimit,
      minutesLimit,
      isSmsEnabled: customPackage.isSmsEnabled !== false,
      isCallEnabled: customPackage.isCallEnabled !== false,
      source: "customPackage",
    };
  }

  return {
    smsUsed: 0,
    minutesUsed: 0,
    smsRemaining: 0,
    minutesRemaining: 0,
    smsLimit: 0,
    minutesLimit: 0,
    isSmsEnabled: false,
    isCallEnabled: false,
    source: "none",
  };
}

/** @deprecated Use `computeUsage` from usageComputationService.js */
export async function computeUserActivityUsage(userId) {
  return computeUsage(userId);
}

/**
 * Single source of truth for which subscription row applies to a user.
 * Latest by `createdAt`; never filter by status.
 */
export async function getLatestSubscription(userId) {
  if (!userId) return null;
  return Subscription.findOne({ userId }).sort({ createdAt: -1 }).lean();
}

export async function loadLatestSubscriptionDocument(userId) {
  return getLatestSubscription(userId);
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
    strategy: "latest subscription document",
  });

  let subscription = await getLatestSubscription(userId);

  if (!subscription) {
    const [customPackageOnly, activityUsage] = await Promise.all([
      getActiveCustomPackage(userId),
      computeUserActivityUsage(userId),
    ]);
    if (customPackageOnly) {
      const usageOnlySubscription = {
        _id: null,
        id: null,
        active: true,
        hasSubscription: false,
        showUsage: true,
        status: "custom_override",
        planType: "custom",
        planName: "Custom Package",
        isUnlimited: false,
        displayUnlimited: false,
        minutesRemaining: 0,
        smsRemaining: 0,
        minutesLimit: 0,
        smsLimit: 0,
        minutesUsed: activityUsage.minutesUsed,
        smsUsed: activityUsage.smsUsed,
        limits: {
          minutesTotal: 0,
          smsTotal: 0,
          numbersTotal: 0,
        },
        usage: {
          minutesUsed: activityUsage.secondsUsed,
          smsUsed: activityUsage.smsUsed,
        },
        dailySmsUsed: 0,
        dailyMinutesUsed: 0,
        usageWindowDateKey: getServerDayKey(),
        periodStart: null,
        periodEnd: null,
        isCallEnabled: customPackageOnly.isCallEnabled !== false,
        isSmsEnabled: customPackageOnly.isSmsEnabled !== false,
        source: "customPackage",
        numbers: [],
      };
      console.log("[subscription] Custom package override without subscription:", {
        userId: String(userId),
        customPackageId: String(customPackageOnly._id),
      });
      return applyCustomPackageToSubscription(usageOnlySubscription, customPackageOnly);
    }
    console.warn("[subscription] No subscription found in DB:", {
      userId: String(userId),
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

  const [numbers, customPackage, activityUsage] = await Promise.all([
    PhoneNumber.find({
      userId,
      status: "active",
    })
      .select("phoneNumber")
      .lean(),
    getActiveCustomPackage(userId),
    computeUserActivityUsage(userId),
  ]);

  const activeAddons = getActiveAddonAmounts(subscription);
  const smsLimit = Math.max(
    0,
    Number(subscription.limits?.smsTotal ?? 0) + Number(activeAddons.smsActive ?? 0)
  );
  const minutesLimit = Math.max(
    0,
    Number(subscription.limits?.minutesTotal ?? 0) +
      Number(activeAddons.minutesActive ?? 0)
  );
  const smsUsed = activityUsage.smsUsed;
  const secondsUsed = activityUsage.secondsUsed;
  const minutesUsed = activityUsage.minutesUsed;
  const minutesRemaining = Math.max(minutesLimit - minutesUsed, 0);
  const smsRemaining = Math.max(smsLimit - smsUsed, 0);
  const unlimited =
    Boolean(subscription.displayUnlimited) ||
    isUnlimitedSubscription(subscription) ||
    /unlimited/i.test(String(subscription.planName || ""));

  const rawStatus = subscription.status || null;

  const baseSubscription = {
    id: subscription._id,
    _id: subscription._id,
    active: rawStatus === "active",
    hasSubscription: true,
    showUsage: true,
    status: rawStatus,
    planType: subscription.planType || null,
    planName: subscription.planName || subscription.planType || subscription.planKey || null,
    isUnlimited: unlimited,
    displayUnlimited: Boolean(subscription.displayUnlimited),
    planId: subscription.planId,
    minutesRemaining,
    smsRemaining,
    minutesLimit,
    smsLimit,
    minutesUsed,
    smsUsed,
    limits: {
      ...(subscription.limits || {}),
      minutesTotal: minutesLimit,
      smsTotal: smsLimit,
      numbersTotal: Number(subscription.limits?.numbersTotal ?? 0),
    },
    usage: {
      ...(subscription.usage || {}),
      minutesUsed: secondsUsed,
      smsUsed,
    },
    dailySmsUsed: subscription.dailySmsUsed || 0,
    dailyMinutesUsed: subscription.dailyMinutesUsed || 0,
    usageWindowDateKey: subscription.usageWindowDateKey || getServerDayKey(),
    periodStart: subscription.periodStart || null,
    periodEnd: subscription.periodEnd || null,
    isCallEnabled: subscription.voiceCallsEnabled !== false,
    isSmsEnabled: true,
    source: "subscription",
    numbers: numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      id: n._id,
    })),
  };
  const resolvedSubscription = applyCustomPackageToSubscription(
    baseSubscription,
    customPackage
  );

  console.log("[USAGE DEBUG]", {
    userId: String(userId),
    subscriptionId: String(subscription._id),
    customPackageId: customPackage?._id ? String(customPackage._id) : null,
    result: {
      source: resolvedSubscription?.source ?? "none",
      smsRemaining: Number(resolvedSubscription?.smsRemaining ?? 0),
      minutesRemaining: Number(resolvedSubscription?.minutesRemaining ?? 0),
      isSmsEnabled: resolvedSubscription?.isSmsEnabled !== false,
      isCallEnabled: resolvedSubscription?.isCallEnabled !== false,
    },
  });

  console.log("[RECOVERY DEBUG]", {
    userId: String(userId),
    smsUsed,
    minutesUsed,
    subscription: {
      id: String(subscription._id),
      status: subscription.status,
      smsLimit,
      minutesLimit,
    },
    customPackage: customPackage
      ? {
          id: String(customPackage._id),
          smsAllowed: Number(customPackage.smsAllowed ?? 0),
          minutesAllowed: Number(customPackage.minutesAllowed ?? 0),
          isSmsEnabled: customPackage.isSmsEnabled !== false,
          isCallEnabled: customPackage.isCallEnabled !== false,
        }
      : null,
    finalUsage: buildEffectiveUsage({
      subscription: resolvedSubscription,
      customPackage,
      activityUsage,
    }),
  });

  return resolvedSubscription;
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

export async function getComputedUsageSnapshot(userId) {
  const [subscription, activity] = await Promise.all([
    getLatestSubscription(userId),
    computeUsage(userId),
  ]);

  const smsUsed = activity.smsUsed;
  const minutesUsed = activity.minutesUsed;

  if (!subscription) {
    return {
      subscription: null,
      customPackage: null,
      smsUsed,
      minutesUsed,
      smsLimit: 0,
      minutesLimit: 0,
      smsRemaining: -smsUsed,
      minutesRemaining: -minutesUsed,
    };
  }

  const smsLimit = Number(subscription.limits?.smsTotal);
  const minutesLimit = Number(subscription.limits?.minutesTotal);

  return {
    subscription,
    customPackage: null,
    smsUsed,
    minutesUsed,
    smsLimit,
    minutesLimit,
    smsRemaining: smsLimit - smsUsed,
    minutesRemaining: minutesLimit - minutesUsed,
  };
}

export function buildPublicSubscriptionState(subscription) {
  if (!subscription) {
    return {
      id: null,
      status: "inactive",
      planName: null,
      limits: null,
      hasSubscription: false,
      isActive: false,
      showUsage: false,
    };
  }

  const isActive = Boolean(
    subscription.isActive !== undefined && subscription.isActive !== null
      ? subscription.isActive
      : subscription.active
  );
  return {
    id: subscription.id ?? subscription._id ?? null,
    status: subscription.status || "inactive",
    planName:
      subscription.planName || subscription.planType || subscription.planKey || null,
    limits: subscription.limits || null,
    hasSubscription: Boolean(
      subscription.hasSubscription ??
        !!(subscription.id || subscription._id)
    ),
    isActive,
    showUsage: subscription.showUsage !== false,
  };
}
