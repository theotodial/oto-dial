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

export function isSmsCampaignCatalogPlan(plan) {
  if (!plan) return false;
  if (plan.smsCampaignPlan === true) return true;
  const t = String(plan.type || "").toLowerCase();
  if (t === "sms_campaign") return true;
  const n = String(plan.name || "").toLowerCase();
  return n.includes("sms campaign");
}

/** Plans paused / not yet purchasable (e.g. Unlimited Call, Enterprise). */
export function isComingSoonPlan(plan) {
  if (!plan) return false;
  if (plan.comingSoon === true) return true;
  const t = String(plan.type || "").toLowerCase();
  if (t === "enterprise") return true;
  const n = String(plan.name || "").toLowerCase();
  return n.includes("enterprise");
}

/** Telecom credits included by a plan (handles new credit plans + legacy fallbacks). */
export function planCreditsIncluded(plan) {
  return Math.max(
    0,
    Number(
      plan?.limits?.creditsTotal ??
        plan?.creditsIncluded ??
        plan?.monthlyCreditsLimit ??
        plan?.limits?.minutesTotal ??
        0
    )
  );
}

/** Display-formatted credit amount (fractional credits rounded to whole numbers for users). */
export function formatCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
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
      { text: "Unlimited telecom credits", included: true },
      { text: "SMS not included", included: false },
      { text: "Email support", included: true },
    ];
  }
  if (isSmsCampaignCatalogPlan(plan)) {
    const s = Math.max(0, Number(plan?.limits?.smsTotal ?? 0));
    return [
      { text: "Free Virtual Number", included: true },
      { text: `${s.toLocaleString()} SMS (inbound + outbound)`, included: true },
      { text: "No call credits — SMS only", included: true },
      { text: "Pro campaign: templates & analytics", included: true },
      { text: "Email support", included: true },
    ];
  }
  const c = planCreditsIncluded(plan);
  return [
    { text: "Free Virtual Number", included: true },
    { text: `${c.toLocaleString()} Telecom Credits`, included: true },
    { text: "Calls & SMS billed from your credits", included: true },
    { text: "Email Support", included: true },
  ];
}

export function planMarketingDescription(plan) {
  if (!plan) return "";
  if (isCatalogUnlimitedPlan(plan)) {
    return "Unlimited outbound calling for power users";
  }
  if (isSmsCampaignCatalogPlan(plan)) {
    return "SMS-first campaigns with templates, analytics, and a shared SMS pool";
  }
  if (String(plan.name || "").toLowerCase().includes("basic")) {
    return "Perfect for individuals and small teams";
  }
  return "For growing businesses and power users";
}
