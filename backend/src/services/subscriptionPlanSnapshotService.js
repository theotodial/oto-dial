import {
  UNLIMITED_INTERNAL_LIMITS,
  UNLIMITED_PLAN_TYPE,
  inferPlanTypeFromEntity
} from "../constants/unlimitedPlan.js";

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInteger(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function buildSubscriptionPlanSnapshot(plan = {}) {
  const planType = inferPlanTypeFromEntity(plan);
  const displayUnlimited = Boolean(
    plan.displayUnlimited || planType === UNLIMITED_PLAN_TYPE
  );

  const dedicatedNumbers = toPositiveInteger(
    plan.dedicatedNumbers ?? plan.limits?.numbersTotal,
    UNLIMITED_INTERNAL_LIMITS.dedicatedNumbers
  );

  const limits = {
    minutesTotal: toSafeNumber(
      plan.limits?.minutesTotal,
      displayUnlimited ? UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit : 0
    ),
    smsTotal: toSafeNumber(
      plan.limits?.smsTotal,
      displayUnlimited ? UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit : 0
    ),
    numbersTotal: dedicatedNumbers
  };

  let monthlySmsLimit = null;
  let monthlyMinutesLimit = null;
  let dailySmsLimit = null;
  let dailyMinutesLimit = null;

  if (displayUnlimited) {
    monthlySmsLimit = toPositiveInteger(
      plan.monthlySmsLimit ?? plan.limits?.smsTotal,
      UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit
    );
    monthlyMinutesLimit = toPositiveInteger(
      plan.monthlyMinutesLimit ?? plan.limits?.minutesTotal,
      UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit
    );
    dailySmsLimit = toPositiveInteger(
      plan.dailySmsLimit,
      UNLIMITED_INTERNAL_LIMITS.dailySmsLimit
    );
    dailyMinutesLimit = toPositiveInteger(
      plan.dailyMinutesLimit,
      UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit
    );

    // Keep canonical monthly limits in subscription.limits for backend calculations.
    limits.smsTotal = monthlySmsLimit;
    limits.minutesTotal = monthlyMinutesLimit;
  }

  return {
    planType,
    displayUnlimited,
    limits,
    dedicatedNumbers,
    monthlySmsLimit,
    monthlyMinutesLimit,
    dailySmsLimit,
    dailyMinutesLimit
  };
}

export function applyPlanSnapshotToSubscription(subscription, plan = {}) {
  const snapshot = buildSubscriptionPlanSnapshot(plan);

  subscription.planType = snapshot.planType;
  subscription.displayUnlimited = snapshot.displayUnlimited;
  subscription.planKey = plan.name || subscription.planKey || null;
  subscription.planName = plan.planName || plan.name || subscription.planName || null;

  subscription.limits = {
    minutesTotal: snapshot.limits.minutesTotal,
    smsTotal: snapshot.limits.smsTotal,
    numbersTotal: snapshot.limits.numbersTotal
  };

  subscription.monthlySmsLimit = snapshot.monthlySmsLimit;
  subscription.monthlyMinutesLimit = snapshot.monthlyMinutesLimit;
  subscription.dailySmsLimit = snapshot.dailySmsLimit;
  subscription.dailyMinutesLimit = snapshot.dailyMinutesLimit;

  return snapshot;
}

export function buildPublicPlanPayload(plan = {}) {
  const snapshot = buildSubscriptionPlanSnapshot(plan);

  if (snapshot.displayUnlimited) {
    return {
      _id: plan._id,
      name: plan.name,
      planName: plan.planName || plan.name,
      planType: snapshot.planType,
      price: plan.price,
      currency: plan.currency,
      stripeProductId: plan.stripeProductId,
      stripePriceId: plan.stripePriceId,
      displayUnlimited: true,
      dedicatedNumbers: snapshot.dedicatedNumbers,
      limits: {
        numbersTotal: snapshot.dedicatedNumbers
      }
    };
  }

  return {
    _id: plan._id,
    name: plan.name,
    planName: plan.planName || plan.name,
    planType: snapshot.planType,
    price: plan.price,
    currency: plan.currency,
    stripeProductId: plan.stripeProductId,
    stripePriceId: plan.stripePriceId,
    displayUnlimited: false,
    limits: plan.limits
  };
}

