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
    creditsTotal: toSafeNumber(
      plan.limits?.creditsTotal,
      toSafeNumber(
        plan.monthlyCreditsLimit,
        toSafeNumber(plan.limits?.minutesTotal, displayUnlimited ? UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit : 0)
      )
    ),
    smsTotal: toSafeNumber(
      plan.limits?.smsTotal,
      displayUnlimited ? UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit : 0
    ),
    numbersTotal: dedicatedNumbers
  };

  let monthlySmsLimit = null;
  let monthlyMinutesLimit = null;
  let monthlyCreditsLimit = toSafeNumber(
    plan.monthlyCreditsLimit,
    toSafeNumber(plan.limits?.creditsTotal, toSafeNumber(plan.limits?.minutesTotal, 0))
  );
  let dailySmsLimit = null;
  let dailyMinutesLimit = null;
  let dailyCreditsLimit = toSafeNumber(plan.dailyCreditsLimit, 0) || null;

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
    monthlyCreditsLimit = toPositiveInteger(
      plan.monthlyCreditsLimit ?? plan.limits?.creditsTotal ?? plan.limits?.minutesTotal,
      UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit
    );
    dailyCreditsLimit = toPositiveInteger(
      plan.dailyCreditsLimit ?? plan.dailyMinutesLimit,
      UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit
    );

    // Keep canonical monthly limits in subscription.limits for backend calculations.
    limits.smsTotal = monthlySmsLimit;
    limits.minutesTotal = monthlyMinutesLimit;
    limits.creditsTotal = monthlyCreditsLimit;
  }

  return {
    planType,
    displayUnlimited,
    limits,
    dedicatedNumbers,
    monthlySmsLimit,
    monthlyMinutesLimit,
    monthlyCreditsLimit,
    dailySmsLimit,
    dailyMinutesLimit,
    dailyCreditsLimit
  };
}

export function applyPlanSnapshotToSubscription(subscription, plan = {}) {
  const snapshot = buildSubscriptionPlanSnapshot(plan);
  const initialCredits = Math.max(
    0,
    Number(
      plan.monthlyCreditsLimit ??
        plan.limits?.creditsTotal ??
        plan.limits?.minutesTotal ??
        snapshot.limits.creditsTotal ??
        0
    )
  );

  subscription.planType = snapshot.planType;
  subscription.displayUnlimited = snapshot.displayUnlimited;
  subscription.planKey = plan.name || subscription.planKey || null;
  subscription.planName = plan.planName || plan.name || subscription.planName || null;

  subscription.limits = {
    minutesTotal: snapshot.limits.minutesTotal,
    creditsTotal: snapshot.limits.creditsTotal,
    smsTotal: snapshot.limits.smsTotal,
    numbersTotal: snapshot.limits.numbersTotal
  };

  subscription.monthlySmsLimit = snapshot.monthlySmsLimit;
  subscription.monthlyMinutesLimit = snapshot.monthlyMinutesLimit;
  subscription.monthlyCreditsLimit = snapshot.monthlyCreditsLimit;
  subscription.dailySmsLimit = snapshot.dailySmsLimit;
  subscription.dailyMinutesLimit = snapshot.dailyMinutesLimit;
  subscription.dailyCreditsLimit = snapshot.dailyCreditsLimit;
  if (!Number.isFinite(Number(subscription.telecomCredits)) || Number(subscription.telecomCredits) <= 0) {
    subscription.telecomCredits = initialCredits;
  }
  if (!Number.isFinite(Number(subscription.remainingCredits)) || Number(subscription.remainingCredits) <= 0) {
    subscription.remainingCredits = initialCredits;
  }
  if (!Number.isFinite(Number(subscription.reservedCredits))) {
    subscription.reservedCredits = 0;
  }
  if (!Number.isFinite(Number(subscription.totalCreditsUsed))) {
    subscription.totalCreditsUsed = 0;
  }
  if (!Number.isFinite(Number(subscription.lifetimeCreditsPurchased))) {
    subscription.lifetimeCreditsPurchased = 0;
  }

  subscription.voiceCallsEnabled = plan.voiceCallsEnabled !== false;
  subscription.smsCampaignPlan = Boolean(plan.smsCampaignPlan);

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

