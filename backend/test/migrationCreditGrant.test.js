import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlanCreditGrant } from "../src/services/migration/migrationCreditGrant.js";
import { STRIPE_PLAN_PRICE_IDS } from "../src/config/stripeCatalog.js";
import { PLAN_CREDITS } from "../src/config/creditConfig.js";

test("resolvePlanCreditGrant prefers Stripe super price over Basic plan document", () => {
  const basicPlan = {
    type: "basic",
    name: "Basic Plan",
    monthlyCreditsLimit: PLAN_CREDITS.basic,
  };
  const subscription = {
    stripePriceId: STRIPE_PLAN_PRICE_IDS.super,
    planId: "basic-plan-id",
    planName: "Basic Plan",
    planType: "basic",
  };
  assert.equal(resolvePlanCreditGrant(subscription, basicPlan), PLAN_CREDITS.super);
});

test("resolvePlanCreditGrant uses plan document when Stripe price absent", () => {
  const superPlan = {
    type: "super",
    name: "Super Plan",
    monthlyCreditsLimit: PLAN_CREDITS.super,
  };
  const subscription = {
    planName: "Super Plan",
    planType: "super",
  };
  assert.equal(resolvePlanCreditGrant(subscription, superPlan), PLAN_CREDITS.super);
});

test("resolvePlanCreditGrant maps basic Stripe price correctly", () => {
  const subscription = { stripePriceId: STRIPE_PLAN_PRICE_IDS.basic };
  assert.equal(resolvePlanCreditGrant(subscription, null), PLAN_CREDITS.basic);
});
