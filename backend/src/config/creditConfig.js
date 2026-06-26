/**
 * Telecom credit configuration — v1 rating table.
 *
 * This file holds the raw rate VALUES. telecomRatingEngine.js is the only module that
 * interprets them, and billingEnforcementGateway.applyBillingEvent() is the only module
 * that mutates balances. Do not hardcode telecom rates anywhere else.
 *
 * Credits are fractional (e.g. connected time is 0.25 credits/second). Round only for display.
 */

function num(envValue, fallback) {
  const n = Number(envValue);
  return Number.isFinite(n) ? n : fallback;
}

function roundCredits(value) {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

/**
 * v1 call lifecycle event credits. Each milestone is charged once as the call reaches it.
 * Env-overridable so production can tune rates without a redeploy.
 */
export const CALL_EVENT_CREDITS = {
  carrier_reject_before_routing: num(process.env.TELECOM_CREDITS_CARRIER_REJECT, 0),
  routed: num(process.env.TELECOM_CREDITS_ROUTED, 2),
  ringing: num(process.env.TELECOM_CREDITS_RINGING, 4),
  busy: num(process.env.TELECOM_CREDITS_BUSY, 2),
  no_answer: num(process.env.TELECOM_CREDITS_NO_ANSWER, 2),
  failed_after_routing: num(process.env.TELECOM_CREDITS_FAILED, 2),
  answered: num(process.env.TELECOM_CREDITS_ANSWERED, 5),
};

/** Connected talk time rate. */
export const CONNECTED_CREDITS_PER_SECOND = num(
  process.env.TELECOM_CONNECTED_CREDITS_PER_SECOND,
  0.25
);

/**
 * Connected time is billed in completed buckets (one ledger row per bucket) to avoid a ledger
 * row per second. Bucket charge = perSecond * bucketSeconds, kept fractional. With the defaults
 * this is 1.5 credits per completed 6-second bucket = exactly 0.25 credits/second.
 */
export const CONNECTED_INTERVAL_SECONDS = Math.max(
  1,
  num(process.env.TELECOM_CONNECTED_INTERVAL_SEC, 6)
);

/** SMS per-segment credits (first segment + each additional segment). */
export const SMS_SEGMENT_CREDITS = {
  gsm7PerSegment: num(process.env.TELECOM_SMS_GSM7_SEGMENT_CREDITS, 15),
  unicodePerSegment: num(process.env.TELECOM_SMS_UNICODE_SEGMENT_CREDITS, 20),
};

/**
 * Backward-compatible rules consumed by the economic serialization machinery and legacy paths.
 * - connected* values now reflect the v1 fractional rate.
 * - outboundAttemptCharge / smsOutboundCharge are ONLY used when TELECOM_RATING_V1=false
 *   (instant legacy revert). Under v1, calls use CALL_EVENT_CREDITS and SMS uses SMS_SEGMENT_CREDITS.
 */
export const CREDIT_RULES = {
  outboundAttemptCharge: num(process.env.TELECOM_LEGACY_ATTEMPT_CHARGE, 1),
  connectedIntervalSeconds: CONNECTED_INTERVAL_SECONDS,
  connectedIntervalCharge: roundCredits(CONNECTED_CREDITS_PER_SECOND * CONNECTED_INTERVAL_SECONDS),
  smsOutboundCharge: num(process.env.TELECOM_LEGACY_SMS_CHARGE, 10),
  // Reservation hold sized to cover pre-connection milestones (routed 2 + ringing 4 + answered 5).
  callReservationMinimum: num(process.env.TELECOM_CALL_RESERVATION_MINIMUM, 11),
};

/** Included telecom credits per subscription plan grant (authoritative new-plan allowances). */
export const PLAN_CREDITS = {
  basic: num(process.env.PLAN_CREDITS_BASIC, 1500),
  super: num(process.env.PLAN_CREDITS_SUPER, 2500),
};

/** Call.source value for billing-matrix harness — excluded from production interval workers. */
export const BILLING_MATRIX_CALL_SOURCE = "billing_matrix";

export const CREDIT_ADDONS = [
  { name: "Credit Pack 1000", quantity: 1000, price: 9.99 },
  { name: "Credit Pack 2500", quantity: 2500, price: 19.99 },
  { name: "Credit Pack 5000", quantity: 5000, price: 34.99 },
];
