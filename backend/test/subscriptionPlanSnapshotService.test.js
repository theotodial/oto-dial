import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UNLIMITED_INTERNAL_LIMITS,
  UNLIMITED_PLAN_TYPE
} from "../src/constants/unlimitedPlan.js";
import {
  applyPlanSnapshotToSubscription,
  buildPublicPlanPayload,
  buildSubscriptionPlanSnapshot
} from "../src/services/subscriptionPlanSnapshotService.js";

test("buildSubscriptionPlanSnapshot applies unlimited defaults for internal limits", () => {
  const snapshot = buildSubscriptionPlanSnapshot({
    name: "Unlimited",
    displayUnlimited: true,
    limits: { numbersTotal: 1 }
  });

  assert.equal(snapshot.planType, UNLIMITED_PLAN_TYPE);
  assert.equal(snapshot.displayUnlimited, true);
  assert.equal(snapshot.monthlySmsLimit, UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit);
  assert.equal(snapshot.monthlyMinutesLimit, UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit);
  assert.equal(snapshot.dailySmsLimit, UNLIMITED_INTERNAL_LIMITS.dailySmsLimit);
  assert.equal(snapshot.dailyMinutesLimit, UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit);
  assert.deepEqual(snapshot.limits, {
    minutesTotal: UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit,
    smsTotal: UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit,
    numbersTotal: 1
  });
});

test("applyPlanSnapshotToSubscription maps unlimited plan metadata for assignment flows", () => {
  const subscription = {
    planType: null,
    displayUnlimited: false,
    planKey: null,
    planName: null,
    limits: {},
    monthlySmsLimit: null,
    monthlyMinutesLimit: null,
    dailySmsLimit: null,
    dailyMinutesLimit: null
  };

  const snapshot = applyPlanSnapshotToSubscription(subscription, {
    type: "unlimited",
    name: "Unlimited",
    planName: "Unlimited",
    displayUnlimited: true,
    dedicatedNumbers: 1
  });

  assert.equal(snapshot.planType, "unlimited");
  assert.equal(subscription.planType, "unlimited");
  assert.equal(subscription.displayUnlimited, true);
  assert.equal(subscription.planKey, "Unlimited");
  assert.equal(subscription.planName, "Unlimited");
  assert.deepEqual(subscription.limits, {
    minutesTotal: UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit,
    smsTotal: UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit,
    numbersTotal: 1
  });
  assert.equal(subscription.monthlySmsLimit, UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit);
  assert.equal(subscription.monthlyMinutesLimit, UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit);
  assert.equal(subscription.dailySmsLimit, UNLIMITED_INTERNAL_LIMITS.dailySmsLimit);
  assert.equal(subscription.dailyMinutesLimit, UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit);
});

test("buildPublicPlanPayload does not expose unlimited internal counters to frontend", () => {
  const payload = buildPublicPlanPayload({
    _id: "plan-1",
    type: "unlimited",
    name: "Unlimited",
    planName: "Unlimited",
    price: 119.99,
    currency: "usd",
    stripeProductId: "prod_123",
    stripePriceId: "price_1T2mI6CxZc7GK7QKObsM4ksT",
    displayUnlimited: true,
    monthlySmsLimit: 400,
    monthlyMinutesLimit: 3600,
    dailySmsLimit: 30,
    dailyMinutesLimit: 180,
    limits: {
      smsTotal: 400,
      minutesTotal: 3600,
      numbersTotal: 1
    }
  });

  assert.equal(payload.displayUnlimited, true);
  assert.equal(payload.planType, "unlimited");
  assert.deepEqual(payload.limits, { numbersTotal: 1 });
  assert.equal(payload.limits.smsTotal, undefined);
  assert.equal(payload.limits.minutesTotal, undefined);
});

test("buildPublicPlanPayload preserves regular plan limits", () => {
  const payload = buildPublicPlanPayload({
    _id: "plan-2",
    type: "basic",
    name: "Basic Plan",
    planName: "Basic",
    price: 49,
    currency: "usd",
    stripeProductId: "prod_basic",
    stripePriceId: "price_basic",
    limits: {
      minutesTotal: 3000,
      smsTotal: 3000,
      numbersTotal: 1
    }
  });

  assert.equal(payload.displayUnlimited, false);
  assert.equal(payload.planType, "basic");
  assert.deepEqual(payload.limits, {
    minutesTotal: 3000,
    smsTotal: 3000,
    numbersTotal: 1
  });
});
