import { CREDIT_RULES } from "./creditConfig.js";

/**
 * Carrier-aware telecom credit pricing (backend authority).
 * Env overrides keep production tunable without redeploying business logic.
 */
export const TELECOM_PRICING = {
  /** Per outbound dial attempt (also CREDIT_RULES.outboundAttemptCharge). */
  perAttemptCredits: Number(
    process.env.TELECOM_PRICE_PER_ATTEMPT_CREDITS ?? CREDIT_RULES.outboundAttemptCharge
  ),
  /** 6-second buckets while connected (answered / in-progress). */
  perConnectedIntervalSeconds: Number(
    process.env.TELECOM_PRICE_CONNECTED_INTERVAL_SEC ??
      CREDIT_RULES.connectedIntervalSeconds
  ),
  perConnectedIntervalCredits: Number(
    process.env.TELECOM_PRICE_CONNECTED_INTERVAL_CREDITS ??
      CREDIT_RULES.connectedIntervalCharge
  ),
  /** Pre-answer ringing / early-media interval billing. */
  preAnswerIntervalBillingEnabled:
    String(process.env.TELECOM_PREANSWER_INTERVAL_BILLING || "false").toLowerCase() ===
    "true",
  perPreAnswerIntervalSeconds: Number(
    process.env.TELECOM_PRICE_PREANSWER_INTERVAL_SEC ??
      CREDIT_RULES.connectedIntervalSeconds
  ),
  perPreAnswerIntervalCredits: Number(
    process.env.TELECOM_PRICE_PREANSWER_INTERVAL_CREDITS ??
      CREDIT_RULES.connectedIntervalCharge
  ),
  /** ISO country code multipliers (E.164 destination). */
  countryMultipliers: {
    US: Number(process.env.TELECOM_PRICE_MULT_US || 1),
    CA: Number(process.env.TELECOM_PRICE_MULT_CA || 1),
    DEFAULT: Number(process.env.TELECOM_PRICE_MULT_DEFAULT || 1),
  },
};

export function resolveCountryMultiplier(destinationE164) {
  const raw = String(destinationE164 || "").trim();
  if (raw.startsWith("+1")) {
    return TELECOM_PRICING.countryMultipliers.US;
  }
  if (raw.startsWith("+")) {
    return TELECOM_PRICING.countryMultipliers.DEFAULT;
  }
  return TELECOM_PRICING.countryMultipliers.DEFAULT;
}

export function scaledCredits(baseCredits, multiplier) {
  const m = Math.max(0, Number(multiplier) || 1);
  const b = Math.max(0, Number(baseCredits) || 0);
  // Keep fractional precision (v1 bills 0.25 credits/second); round only to avoid float drift.
  return Math.max(0, Math.round(b * m * 10000) / 10000);
}
