/**
 * Public catalog plan helpers. Unlimited plans store internal caps in `limits` for enforcement;
 * marketing copy must not show those numbers as the advertised allowance.
 */

export function isCatalogUnlimitedPlan(plan) {
  if (!plan) return false;
  if (plan.displayUnlimited === true) return true;
  const t = String(plan.type || "").toLowerCase();
  if (t === "unlimited") return true;
  const n = String(plan.name || "").toLowerCase();
  return n.includes("unlimited");
}

/** Trial is admin/testing only — hide from self-service billing and public pricing. */
export function isTrialPlan(plan) {
  if (!plan) return false;
  const t = String(plan.type || "").toLowerCase();
  if (t === "trial") return true;
  const n = String(plan.name || "").toLowerCase().trim();
  return n === "trial" || n.startsWith("trial ");
}

/** @typedef {{ text: string, included?: boolean }} PlanFeatureItem */

/**
 * Coerce API/string entries to `{ text, included }` for list rendering.
 * @param {PlanFeatureItem | string} feature
 * @returns {{ text: string, included: boolean }}
 */
export function normalizePlanFeature(feature) {
  if (feature && typeof feature === "object" && "text" in feature) {
    return {
      text: String(feature.text ?? ""),
      included: feature.included !== false,
    };
  }
  return { text: String(feature ?? ""), included: true };
}

/**
 * Feature bullets for pricing / billing UI (aligned with Mongo plan when not unlimited).
 * @returns {PlanFeatureItem[]}
 */
export function getPlanFeatureBullets(plan) {
  if (isCatalogUnlimitedPlan(plan)) {
    return [
      { text: "Free Virtual Number", included: true },
      { text: "Unlimited voice minutes", included: true },
      { text: "SMS not included", included: false },
      { text: "Email support", included: true },
    ];
  }
  const m = Math.max(0, Number(plan?.limits?.minutesTotal ?? 0));
  const s = Math.max(0, Number(plan?.limits?.smsTotal ?? 0));
  return [
    { text: "Free Virtual Number", included: true },
    { text: `${m.toLocaleString()} Voice Minutes`, included: true },
    { text: `${s.toLocaleString()} SMS`, included: true },
    { text: "Email Support", included: true },
  ];
}

export function planMarketingDescription(plan) {
  if (!plan) return "";
  if (isCatalogUnlimitedPlan(plan)) {
    return "Unlimited outbound calling for power users";
  }
  if (String(plan.name || "").toLowerCase().includes("basic")) {
    return "Perfect for individuals and small teams";
  }
  return "For growing businesses and power users";
}
