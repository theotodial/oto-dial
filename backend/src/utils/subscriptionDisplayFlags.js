import { isUnlimitedSubscription } from "../services/unlimitedUsageService.js";

/**
 * "Unlimited Call" retail product: unlimited voice (fair-use), SMS is capped / add-ons — not marketed as ∞ SMS.
 * Other unlimited-type plans (e.g. staff / affiliate) keep ∞ for both unless they share this exact naming.
 */
export function isVoiceOnlyUnlimitedCallRetailPlan(entity = {}) {
  const n = String(entity.planName || entity.planKey || "").toLowerCase();
  return n.includes("unlimited call");
}

/**
 * UI: when to show ∞ vs numeric remaining (bootstrap + public subscription payloads).
 */
export function getSubscriptionUsageDisplayFlags(entity = {}) {
  const voiceBucketUnlimited = isUnlimitedSubscription(entity);
  const voiceOnlyRetail = isVoiceOnlyUnlimitedCallRetailPlan(entity);
  return {
    unlimitedMinutesDisplay: voiceBucketUnlimited,
    unlimitedSmsDisplay: voiceBucketUnlimited && !voiceOnlyRetail,
  };
}
