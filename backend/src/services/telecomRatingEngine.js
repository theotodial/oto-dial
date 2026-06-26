/**
 * Telecom Rating Engine (v1) — the SINGLE source of truth for how many telecom credits
 * every billable telecom event costs.
 *
 * No other module may define telecom rates. Actual balance mutations still flow only through
 * applyBillingEvent() in billingEnforcementGateway.js; this module only answers "how much".
 *
 * v1 rate table (credits):
 *   Calls (each lifecycle milestone charged once as it is reached):
 *     carrier_reject_before_routing = 0
 *     routed                        = 2
 *     ringing                       = 4
 *     busy                          = 2
 *     no_answer                     = 2
 *     failed_after_routing          = 2
 *     answered                      = 5
 *     connected                     = 0.25 / second
 *   SMS (per segment):
 *     GSM-7   = 15 per segment (first + each additional)
 *     Unicode = 20 per segment (first + each additional)
 *
 * Credits are fractional internally (e.g. 0.25/sec). Round only for display.
 */

import {
  CALL_EVENT_CREDITS,
  CONNECTED_CREDITS_PER_SECOND,
  SMS_SEGMENT_CREDITS,
} from "../config/creditConfig.js";

/** Canonical telecom call lifecycle billing events. */
export const CALL_BILLING_EVENT = {
  CARRIER_REJECT_BEFORE_ROUTING: "carrier_reject_before_routing",
  ROUTED: "routed",
  RINGING: "ringing",
  BUSY: "busy",
  NO_ANSWER: "no_answer",
  FAILED_AFTER_ROUTING: "failed_after_routing",
  ANSWERED: "answered",
};

/**
 * Whether the v1 rating table is active. Defaults to enabled (this is the migration target);
 * set TELECOM_RATING_V1=false for an instant revert to legacy rating without a redeploy.
 * Read lazily so tests / ops can toggle at runtime.
 */
export function isRatingV1Enabled() {
  return String(process.env.TELECOM_RATING_V1 ?? "true").toLowerCase() !== "false";
}

function roundCredits(value) {
  // Keep up to 4 decimals to avoid binary float drift; honors fractional 0.25/sec billing.
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

/**
 * Credit cost of a single call lifecycle event.
 * @param {string} eventType - one of CALL_BILLING_EVENT values
 * @returns {number} credits (>= 0)
 */
export function rateCallEvent(eventType) {
  const credits = CALL_EVENT_CREDITS[eventType];
  if (!Number.isFinite(Number(credits))) return 0;
  return roundCredits(Math.max(0, Number(credits)));
}

/**
 * Credit cost of connected talk time.
 * @param {number} seconds - connected seconds (will be floored to whole seconds)
 * @returns {number} credits (>= 0)
 */
export function rateConnectedSeconds(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return roundCredits(s * CONNECTED_CREDITS_PER_SECOND);
}

/** Per-second connected rate (credits/second). */
export function connectedCreditsPerSecond() {
  return roundCredits(CONNECTED_CREDITS_PER_SECOND);
}

/**
 * Credit cost of an SMS message based on encoding + segment count.
 * @param {object} p
 * @param {"GSM"|"GSM-7"|"UNICODE"|"Unicode"|string} p.encoding
 * @param {number} p.segments - number of segments (>= 1)
 * @returns {number} credits (>= 0)
 */
export function rateSms({ encoding, segments } = {}) {
  const seg = Math.max(1, Math.floor(Number(segments) || 1));
  const isUnicode = String(encoding || "").toUpperCase().includes("UNICODE");
  const perSegment = isUnicode
    ? SMS_SEGMENT_CREDITS.unicodePerSegment
    : SMS_SEGMENT_CREDITS.gsm7PerSegment;
  return roundCredits(seg * Math.max(0, Number(perSegment) || 0));
}

/** Public, read-only snapshot of the active rate table (for admin/diagnostics). */
export function getRatingTableSnapshot() {
  return {
    version: "v1",
    enabled: isRatingV1Enabled(),
    callEventCredits: { ...CALL_EVENT_CREDITS },
    connectedCreditsPerSecond: CONNECTED_CREDITS_PER_SECOND,
    smsSegmentCredits: { ...SMS_SEGMENT_CREDITS },
  };
}
