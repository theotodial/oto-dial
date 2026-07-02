/** Plans paused for new purchases — still visible in catalog UI. */
export const TEMPORARILY_UNAVAILABLE_PLAN_NAMES = new Set(["Basic Plan"]);

/** When true, add-on packs remain visible but cannot be purchased. */
export const ADDONS_TEMPORARILY_UNAVAILABLE = true;

export const UNAVAILABLE_CHECKOUT_ERROR =
  "This option is not available at the moment. Please contact support.";

export function isTemporarilyUnavailablePlan(plan) {
  if (!plan) return false;
  const name = String(plan.name || plan.planName || "").trim();
  return TEMPORARILY_UNAVAILABLE_PLAN_NAMES.has(name);
}

export function areAddonsPurchasable() {
  return !ADDONS_TEMPORARILY_UNAVAILABLE;
}
