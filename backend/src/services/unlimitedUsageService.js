import Subscription from "../models/Subscription.js";
import { computeUsageInWindow } from "./usageComputationService.js";
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

export function getServerDayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Billing period if current time falls inside it; otherwise calendar month (server local). */
export function getUnlimitedMonthlyWindow(subscription = {}, now = new Date()) {
  const ps = subscription?.periodStart ? new Date(subscription.periodStart) : null;
  const pe = subscription?.periodEnd ? new Date(subscription.periodEnd) : null;
  if (
    ps &&
    pe &&
    !Number.isNaN(ps.getTime()) &&
    !Number.isNaN(pe.getTime()) &&
    pe > ps &&
    now >= ps &&
    now <= pe
  ) {
    return { start: ps, end: pe };
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { start, end };
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

  if (!userId) {
    console.warn("[USAGE CHECK] unlimited plan but missing userId — allowing request", {
      channel,
      subscriptionId: subscriptionId ? String(subscriptionId) : null,
    });
    return { allowed: true, subscription };
  }

  const limits = getUnlimitedLimits(subscription);
  const now = new Date();
  const monthlyWindow = getUnlimitedMonthlyWindow(subscription, now);
  const { start: dayStart, end: dayEnd } = getServerDayBounds(now);

  const [monthly, daily] = await Promise.all([
    computeUsageInWindow(userId, monthlyWindow.start, monthlyWindow.end),
    computeUsageInWindow(userId, dayStart, dayEnd),
  ]);

  const monthlySmsUsed = monthly.smsUsed;
  const monthlyMinutesUsedSeconds = monthly.secondsUsed;
  const dailySmsUsed = daily.smsUsed;
  const dailyMinutesUsedSeconds = daily.secondsUsed;

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

/**
 * Usage is no longer persisted on Subscription; unlimited caps are enforced in
 * {@link checkUnlimitedUsageBeforeAction} from SMS/Call collections. Kept as a
 * no-op for call-site compatibility.
 */
export async function incrementUnlimitedUsageAfterSuccess({
  subscriptionId,
  userId = null,
  channel = "unknown",
  smsIncrement = 0,
  minutesIncrementSeconds = 0
}) {
  void subscriptionId;
  void userId;
  void channel;
  void smsIncrement;
  void minutesIncrementSeconds;
  return { success: true, skipped: true };
}
