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

/**
 * Feature bullets for pricing / billing UI (aligned with Mongo plan when not unlimited).
 */
export function getPlanFeatureBullets(plan) {
  if (isCatalogUnlimitedPlan(plan)) {
    return [
      "Free Virtual Number",
      "Unlimited voice minutes (fair-use policy)",
      "Unlimited SMS (fair-use policy)",
      "Email support",
    ];
  }
  const m = Math.max(0, Number(plan?.limits?.minutesTotal ?? 0));
  const s = Math.max(0, Number(plan?.limits?.smsTotal ?? 0));
  return [
    "Free Virtual Number",
    `${m.toLocaleString()} Voice Minutes`,
    `${s.toLocaleString()} SMS`,
    "Email Support",
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
