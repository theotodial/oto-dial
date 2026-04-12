import Subscription from "../models/Subscription.js";
import {
  SUSPICIOUS_ACTIVITY_ERROR,
  UNLIMITED_INTERNAL_LIMITS,
  UNLIMITED_PLAN_TYPE,
  inferPlanTypeFromEntity
} from "../constants/unlimitedPlan.js";

export function createSuspiciousActivityErrorPayload() {
  return { success: false, error: SUSPICIOUS_ACTIVITY_ERROR };
}

export function getServerDayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isUnlimitedSubscription(subscription = {}) {
  return (
    Boolean(subscription.displayUnlimited) ||
    inferPlanTypeFromEntity(subscription) === UNLIMITED_PLAN_TYPE
  );
}

export function getUnlimitedLimits(subscription = {}) {
  const monthlySmsLimit =
    Number(subscription.monthlySmsLimit) > 0
      ? Number(subscription.monthlySmsLimit)
      : UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit;

  const monthlyMinutesLimit =
    Number(subscription.monthlyMinutesLimit) > 0
      ? Number(subscription.monthlyMinutesLimit)
      : UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit;

  const dailySmsLimit =
    Number(subscription.dailySmsLimit) > 0
      ? Number(subscription.dailySmsLimit)
      : UNLIMITED_INTERNAL_LIMITS.dailySmsLimit;

  const dailyMinutesLimit =
    Number(subscription.dailyMinutesLimit) > 0
      ? Number(subscription.dailyMinutesLimit)
      : UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit;

  return {
    monthlySmsLimit,
    monthlyMinutesLimit,
    monthlyMinutesLimitSeconds: monthlyMinutesLimit * 60,
    dailySmsLimit,
    dailyMinutesLimit,
    dailyMinutesLimitSeconds: dailyMinutesLimit * 60
  };
}

async function resetDailyWindowIfNeeded(subscriptionId, dayKey) {
  const now = new Date();

  await Subscription.updateOne(
    {
      _id: subscriptionId,
      usageWindowDateKey: { $ne: dayKey }
    },
    {
      $set: {
        usageWindowDateKey: dayKey,
        dailySmsUsed: 0,
        dailyMinutesUsed: 0,
        lastUsageReset: now
      }
    }
  );
}

function logLimitExceeded({
  userId = null,
  subscriptionId = null,
  channel = "unknown",
  reason = "unknown",
  details = {}
}) {
  console.warn(
    "[limit_exceeded]",
    JSON.stringify({
      event: "limit_exceeded",
      channel,
      reason,
      userId: userId ? String(userId) : null,
      subscriptionId: subscriptionId ? String(subscriptionId) : null,
      details,
      at: new Date().toISOString()
    })
  );
}

export async function checkUnlimitedUsageBeforeAction({
  subscriptionId,
  userId = null,
  channel = "unknown",
  smsIncrement = 0,
  minutesIncrementSeconds = 0
}) {
  const dayKey = getServerDayKey();
  await resetDailyWindowIfNeeded(subscriptionId, dayKey);

  const subscription = await Subscription.findById(subscriptionId).lean();
  if (!subscription || !isUnlimitedSubscription(subscription)) {
    console.log("[USAGE CHECK] PASSED (not unlimited — no usage gate)", {
      channel,
      userId: userId ? String(userId) : null,
      subscriptionId: subscriptionId ? String(subscriptionId) : null,
    });
    return {
      allowed: true,
      subscription
    };
  }

  const limits = getUnlimitedLimits(subscription);
  const monthlySmsUsed = Number(subscription.usage?.smsUsed || 0);
  const monthlyMinutesUsedSeconds = Number(subscription.usage?.minutesUsed || 0);
  const dailySmsUsed = Number(subscription.dailySmsUsed || 0);
  const dailyMinutesUsedSeconds = Number(subscription.dailyMinutesUsed || 0);

  const exceededMonthlySms =
    monthlySmsUsed + smsIncrement > limits.monthlySmsLimit;
  const exceededMonthlyMinutes =
    monthlyMinutesUsedSeconds + minutesIncrementSeconds >
    limits.monthlyMinutesLimitSeconds;
  const exceededDailySms = dailySmsUsed + smsIncrement > limits.dailySmsLimit;
  const exceededDailyMinutes =
    dailyMinutesUsedSeconds + minutesIncrementSeconds >
    limits.dailyMinutesLimitSeconds;

  const blocked =
    exceededMonthlySms ||
    exceededMonthlyMinutes ||
    exceededDailySms ||
    exceededDailyMinutes;

  if (blocked) {
    logLimitExceeded({
      userId,
      subscriptionId,
      channel,
      reason: "pre_action_guard",
      details: {
        monthlySmsUsed,
        monthlyMinutesUsedSeconds,
        dailySmsUsed,
        dailyMinutesUsedSeconds,
        limits,
        smsIncrement,
        minutesIncrementSeconds
      }
    });

    console.warn("[USAGE CHECK] BLOCKED (unlimited internal limits)", {
      channel,
      userId: userId ? String(userId) : null,
      subscriptionId: subscriptionId ? String(subscriptionId) : null,
      reason: "limit_exceeded",
    });
    return {
      allowed: false,
      subscription,
      reason: "limit_exceeded"
    };
  }

  console.log("[USAGE CHECK] PASSED (unlimited within limits)", {
    channel,
    userId: userId ? String(userId) : null,
    subscriptionId: subscriptionId ? String(subscriptionId) : null,
  });
  return {
    allowed: true,
    subscription
  };
}

export async function incrementUnlimitedUsageAfterSuccess({
  subscriptionId,
  userId = null,
  channel = "unknown",
  smsIncrement = 0,
  minutesIncrementSeconds = 0
}) {
  if (smsIncrement <= 0 && minutesIncrementSeconds <= 0) {
    return { success: true, skipped: true };
  }

  const dayKey = getServerDayKey();
  await resetDailyWindowIfNeeded(subscriptionId, dayKey);

  const subscription = await Subscription.findById(subscriptionId).lean();
  if (!subscription || !isUnlimitedSubscription(subscription)) {
    return { success: true, skipped: true };
  }

  const limits = getUnlimitedLimits(subscription);

  const query = {
    _id: subscriptionId,
    status: "active",
    usageWindowDateKey: dayKey
  };

  if (smsIncrement > 0) {
    query["usage.smsUsed"] = { $lte: limits.monthlySmsLimit - smsIncrement };
    query.dailySmsUsed = { $lte: limits.dailySmsLimit - smsIncrement };
  }

  if (minutesIncrementSeconds > 0) {
    query["usage.minutesUsed"] = {
      $lte: limits.monthlyMinutesLimitSeconds - minutesIncrementSeconds
    };
    query.dailyMinutesUsed = {
      $lte: limits.dailyMinutesLimitSeconds - minutesIncrementSeconds
    };
  }

  const incrementSet = {};
  if (smsIncrement > 0) {
    incrementSet["usage.smsUsed"] = smsIncrement;
    incrementSet.dailySmsUsed = smsIncrement;
  }
  if (minutesIncrementSeconds > 0) {
    incrementSet["usage.minutesUsed"] = minutesIncrementSeconds;
    incrementSet.dailyMinutesUsed = minutesIncrementSeconds;
  }

  const updateResult = await Subscription.updateOne(query, {
    $inc: incrementSet
  });

  if (updateResult.modifiedCount === 1) {
    return { success: true };
  }

  const capUpdate = { $max: {} };
  if (smsIncrement > 0) {
    capUpdate.$max["usage.smsUsed"] = limits.monthlySmsLimit;
    capUpdate.$max.dailySmsUsed = limits.dailySmsLimit;
  }
  if (minutesIncrementSeconds > 0) {
    capUpdate.$max["usage.minutesUsed"] = limits.monthlyMinutesLimitSeconds;
    capUpdate.$max.dailyMinutesUsed = limits.dailyMinutesLimitSeconds;
  }

  await Subscription.updateOne({ _id: subscriptionId }, capUpdate);

  logLimitExceeded({
    userId,
    subscriptionId,
    channel,
    reason: "post_success_increment_blocked",
    details: {
      limits,
      smsIncrement,
      minutesIncrementSeconds
    }
  });

  return {
    success: false,
    limitReached: true
  };
}

