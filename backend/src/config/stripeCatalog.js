import {
  AFFILIATE_UNLIMITED_PLAN_TYPE,
  AFFILIATE_UNLIMITED_STRIPE_PRICE_ID
} from "../constants/affiliatePlan.js";
import {
  UNLIMITED_PLAN_TYPE,
  UNLIMITED_STRIPE_PRICE_ID
} from "../constants/unlimitedPlan.js";

export const STRIPE_PLAN_PRICE_IDS = {
  basic: "price_1SlbCBCxZc7GK7QKVTtMnI97",
  super: "price_1SxHV2CxZc7GK7QKydR5iwQH",
  [UNLIMITED_PLAN_TYPE]: UNLIMITED_STRIPE_PRICE_ID,
  [AFFILIATE_UNLIMITED_PLAN_TYPE]: AFFILIATE_UNLIMITED_STRIPE_PRICE_ID
};

export const STRIPE_ADDON_PRICE_IDS = {
  minutes_700: "price_1SydwJCxZc7GK7QKueMgVVCN",
  sms_500: "price_1SydqXCxZc7GK7QKzkglzB1l"
};

function normalizePlanName(name) {
  return (name || "").trim().toLowerCase();
}

export function getCanonicalPlanPriceId(plan) {
  const explicitType = normalizePlanName(plan?.type || plan?.planType);
  if (explicitType === AFFILIATE_UNLIMITED_PLAN_TYPE) {
    return STRIPE_PLAN_PRICE_IDS[AFFILIATE_UNLIMITED_PLAN_TYPE];
  }

  const normalizedName = normalizePlanName(plan?.name);
  if (
    normalizedName.includes("affiliate") &&
    normalizedName.includes("unlimited")
  ) {
    return STRIPE_PLAN_PRICE_IDS[AFFILIATE_UNLIMITED_PLAN_TYPE];
  }

  if (
    explicitType === UNLIMITED_PLAN_TYPE ||
    normalizedName.includes("unlimited") ||
    Boolean(plan?.displayUnlimited)
  ) {
    return STRIPE_PLAN_PRICE_IDS[UNLIMITED_PLAN_TYPE];
  }
  if (normalizedName.includes("super")) {
    return STRIPE_PLAN_PRICE_IDS.super;
  }
  if (normalizedName.includes("basic")) {
    return STRIPE_PLAN_PRICE_IDS.basic;
  }
  if (
    Number(plan?.price || 0) >= 119.99 ||
    Number(plan?.limits?.minutesTotal || 0) >= 3600
  ) {
    return STRIPE_PLAN_PRICE_IDS[UNLIMITED_PLAN_TYPE];
  }
  if (
    Number(plan?.price || 0) >= 29.99 ||
    Number(plan?.limits?.minutesTotal || 0) >= 2500
  ) {
    return STRIPE_PLAN_PRICE_IDS.super;
  }
  if (Number(plan?.price || 0) > 0) {
    return STRIPE_PLAN_PRICE_IDS.basic;
  }
  return plan?.stripePriceId || null;
}

export function getCanonicalAddonPriceId(addon) {
  const type = (addon?.type || "").toLowerCase();
  const quantity = Number(addon?.quantity || 0);

  if (type === "minutes" && quantity === 700) {
    return STRIPE_ADDON_PRICE_IDS.minutes_700;
  }
  if (type === "sms" && quantity === 500) {
    return STRIPE_ADDON_PRICE_IDS.sms_500;
  }

  // Force one-time add-on Stripe IDs for minutes/SMS to avoid recurring legacy price IDs.
  if (type === "minutes") {
    return STRIPE_ADDON_PRICE_IDS.minutes_700;
  }
  if (type === "sms") {
    return STRIPE_ADDON_PRICE_IDS.sms_500;
  }

  return addon?.stripePriceId || null;
}

export function getCanonicalPlanKeyFromPriceId(priceId) {
  if (priceId === STRIPE_PLAN_PRICE_IDS[AFFILIATE_UNLIMITED_PLAN_TYPE]) {
    return AFFILIATE_UNLIMITED_PLAN_TYPE;
  }
  if (priceId === STRIPE_PLAN_PRICE_IDS[UNLIMITED_PLAN_TYPE]) {
    return UNLIMITED_PLAN_TYPE;
  }
  if (priceId === STRIPE_PLAN_PRICE_IDS.super) {
    return "super";
  }
  if (priceId === STRIPE_PLAN_PRICE_IDS.basic) {
    return "basic";
  }
  return null;
}

export function isKnownAddonPriceId(priceId) {
  return Object.values(STRIPE_ADDON_PRICE_IDS).includes(priceId);
}
