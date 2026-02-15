export const STRIPE_PLAN_PRICE_IDS = {
  basic: "price_1SlbCBCxZc7GK7QKVTtMnI97",
  super: "price_1SxHV2CxZc7GK7QKydR5iwQH"
};

export const STRIPE_ADDON_PRICE_IDS = {
  minutes_700: "price_1SydwJCxZc7GK7QKueMgVVCN",
  sms_500: "price_1SydqXCxZc7GK7QKzkglzB1l"
};

function normalizePlanName(name) {
  return (name || "").trim().toLowerCase();
}

export function getCanonicalPlanPriceId(plan) {
  const normalizedName = normalizePlanName(plan?.name);
  if (normalizedName.includes("super")) {
    return STRIPE_PLAN_PRICE_IDS.super;
  }
  if (normalizedName.includes("basic")) {
    return STRIPE_PLAN_PRICE_IDS.basic;
  }
  if (Number(plan?.price || 0) >= 29.99 || Number(plan?.limits?.minutesTotal || 0) >= 2500) {
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
