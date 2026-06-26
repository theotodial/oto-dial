import Call from "../models/Call.js";
import { CREDIT_RULES } from "../config/creditConfig.js";
import {
  reserveCreditsForOutboundCallSerialized,
  chargeOutboundAttemptSerialized,
  chargeCallEventSerialized,
  billConnectedDurationIntervalsSerialized,
  releaseUnusedCallReservationSerialized,
  finalizeEconomicTimelineForCall,
} from "./economicSerializationService.js";
import { rateCallEvent, isRatingV1Enabled, CALL_BILLING_EVENT } from "./telecomRatingEngine.js";
import { allowOutboundCreditDebugBypass } from "../utils/outboundCreditDebugBypass.js";
import { telecomStructuredLog } from "../utils/telecomStructuredLog.js";

const ACTIVE_STATES = new Set(["answered", "in-progress"]);
const TERMINAL_STATES = new Set([
  "completed",
  "failed",
  "rejected",
  "canceled",
  "busy",
  "no-answer",
]);

function attemptKey(callId) {
  return `call:${String(callId)}:attempt`;
}

async function markAttemptChargedOnCall(call, billing, context = {}) {
  const key = attemptKey(call._id);
  const ledgerId = billing?.ledger?._id || billing?.ledger?.id || null;
  const now = new Date();
  await Call.updateOne(
    { _id: call._id },
    {
      $set: {
        attemptCharged: true,
        attemptChargedAt: call.attemptChargedAt || now,
        attemptChargeIdempotencyKey: key,
        attemptChargeTransactionId: ledgerId ? String(ledgerId) : key,
        durationBillingCursorAt:
          call.durationBillingCursorAt || call.callAnsweredAt || call.callStartedAt || null,
      },
    }
  );
  telecomStructuredLog("[TELECOM CHARGE]", {
    sourcePath: context.sourcePath || "callCreditBillingService.js",
    phase: "attempt_charge",
    callId: String(call._id),
    userId: call.user ? String(call.user) : null,
    duplicate: Boolean(billing?.duplicate),
    eventType: context.eventType || null,
    credits: CREDIT_RULES.outboundAttemptCharge,
  });
}

export async function reserveCreditsForOutboundCall(call, options = {}) {
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    return { ok: true, skipped: true };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping reserveCreditsForOutboundCall",
      { callId: String(call._id) }
    );
    return { ok: true, skipped: true, debugBypass: true };
  }
  const result = await reserveCreditsForOutboundCallSerialized(call, options);
  if (!result || result.ok === false) {
    return result || { ok: false, code: "RESERVE_FAILED" };
  }
  const billing = result?.billing;
  const hold = Number(result.hold || 0);
  if (hold > 0 && (!billing || !billing.duplicate)) {
    await Call.updateOne(
      { _id: call._id },
      {
        $set: {
          creditReservationHeld: hold,
          "riskPricing.reservationMultiplier": result.reservationMultiplier || 1,
          "riskPricing.reservationHeld": hold,
        },
      }
    );
  }
  return { ok: true, hold, billing, reservationMultiplier: result.reservationMultiplier };
}

/**
 * Deduct 1 credit when the carrier accepts the outbound dial (ringing / provider leg live).
 * Idempotent per call — never double-charge the same attempt.
 */
export async function chargeProviderAcceptedAttempt(call, context = {}) {
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    return { ok: true, skipped: true };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping chargeProviderAcceptedAttempt",
      { callId: String(call._id) }
    );
    return { ok: true, skipped: true, debugBypass: true };
  }

  if (call.attemptChargedAt || call.attemptCharged === true) {
    return { ok: true, duplicate: true, skipped: true, reason: "already_charged" };
  }

  const result = await chargeOutboundAttemptSerialized(call);
  if (!result?.ok) {
    return result;
  }

  const billing = result?.billing;
  if (billing?.ok === false && billing?.code === "INSUFFICIENT_CREDITS") {
    return billing;
  }

  await markAttemptChargedOnCall(call, billing, context);
  return { ok: true, billing, duplicate: Boolean(billing?.duplicate) };
}

/** @deprecated Use chargeProviderAcceptedAttempt — kept for imports */
export const chargeOutboundAttempt = chargeProviderAcceptedAttempt;

/** v1 lifecycle events that are billed on outbound calls (per the v1 rating table). */
export const V1_OUTBOUND_BILLABLE_EVENTS = new Set([
  CALL_BILLING_EVENT.ROUTED,
  CALL_BILLING_EVENT.RINGING,
  CALL_BILLING_EVENT.BUSY,
  CALL_BILLING_EVENT.NO_ANSWER,
  CALL_BILLING_EVENT.FAILED_AFTER_ROUTING,
  CALL_BILLING_EVENT.ANSWERED,
]);

/**
 * v1 Telecom Rating Engine entry point for a call lifecycle milestone.
 * Charges the credits for `eventName` exactly once per call (idempotent), AFTER the telecom
 * flow has reached that billable event. Never interferes with signalling.
 *
 * No-op when TELECOM_RATING_V1=false (legacy single-attempt billing remains in effect),
 * when the event is zero-rated, or when the call is not an outbound call.
 *
 * @param {object} call - lean or doc with _id, user, direction
 * @param {string} eventName - one of CALL_BILLING_EVENT values
 * @param {object} [context] - { sourcePath, eventType }
 */
export async function chargeCallLifecycleEvent(call, eventName, context = {}) {
  if (!isRatingV1Enabled()) {
    return { ok: true, skipped: true, reason: "rating_v1_disabled" };
  }
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    return { ok: true, skipped: true, reason: "not_outbound" };
  }
  if (!V1_OUTBOUND_BILLABLE_EVENTS.has(eventName)) {
    return { ok: true, skipped: true, reason: "event_not_billable" };
  }
  const credits = rateCallEvent(eventName);
  if (credits <= 0) {
    return { ok: true, skipped: true, reason: "zero_rated" };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping chargeCallLifecycleEvent",
      { callId: String(call._id), eventName }
    );
    return { ok: true, skipped: true, debugBypass: true };
  }

  // Fast-skip if already billed (ledger key remains the real idempotency authority).
  if (Array.isArray(call.billedCallEvents) && call.billedCallEvents.includes(eventName)) {
    return { ok: true, duplicate: true, skipped: true, reason: "already_billed_event" };
  }

  const result = await chargeCallEventSerialized(call, eventName);
  if (!result?.ok) {
    return result;
  }
  const billing = result?.billing;
  if (billing?.ok === false && billing?.code === "INSUFFICIENT_CREDITS") {
    return billing;
  }

  await Call.updateOne(
    { _id: call._id },
    {
      $addToSet: { billedCallEvents: eventName },
      $set: { lastBillingAt: new Date() },
    }
  );

  telecomStructuredLog("[TELECOM CHARGE]", {
    sourcePath: context.sourcePath || "callCreditBillingService.chargeCallLifecycleEvent",
    phase: "call_event_charge",
    event: eventName,
    callId: String(call._id),
    userId: call.user ? String(call.user) : null,
    duplicate: Boolean(billing?.duplicate || result?.skipped),
    eventType: context.eventType || null,
    credits,
  });

  return { ok: true, billing, eventName, credits, duplicate: Boolean(billing?.duplicate) };
}

export async function billConnectedDurationIntervals(call) {
  if (!call?._id || !call?.user) return { ok: true, skipped: true };
  if (!ACTIVE_STATES.has(String(call.status))) {
    return { ok: true, skipped: true, reason: "not_active" };
  }
  const answeredAt = call.callAnsweredAt || call.callStartedAt;
  if (!answeredAt) return { ok: true, skipped: true, reason: "not_answered" };
  if (allowOutboundCreditDebugBypass()) {
    return { ok: true, skipped: true, debugBypass: true };
  }

  const result = await billConnectedDurationIntervalsSerialized(call);
  if (result?.ok && Number(result.chargedNow) > 0) {
    await Call.updateOne({ _id: call._id }, { $set: { lastBillingAt: new Date() } });
  }
  return result;
}

export async function releaseUnusedCallReservation(call) {
  if (!call?._id || !call?.user) return { ok: true, skipped: true };
  const held = Math.max(0, Number(call.creditReservationHeld || 0));
  if (held <= 0) return { ok: true, skipped: true };

  // Under v1 rating, lifecycle milestones are direct debits that don't settle the reservation,
  // so the counter-based `releasable` heuristic is unreliable. Always run the serialized release,
  // which returns the timeline's actual remaining reserved credits to the subscriber.
  if (!isRatingV1Enabled()) {
    const alreadyCharged = Math.max(
      0,
      Number(call.durationCreditsCharged || 0) + Number(call.attemptChargedAt ? 1 : 0)
    );
    const releasable = Math.max(0, held - alreadyCharged);
    if (releasable <= 0) {
      await Call.updateOne(
        { _id: call._id, creditReservationReleasedAt: null },
        { $set: { creditReservationReleasedAt: new Date(), durationBillingStoppedAt: new Date() } }
      );
      return { ok: true, skipped: true, reason: "nothing_to_release" };
    }
  }

  const result = await releaseUnusedCallReservationSerialized(call);
  const billing = result?.billing ?? result;
  if (result?.ok) {
    await Call.updateOne(
      { _id: call._id },
      { $set: { creditReservationReleasedAt: new Date(), durationBillingStoppedAt: new Date() } }
    );
  }
  return billing;
}

export async function stopCallDurationBilling(callId) {
  const call = await Call.findById(callId);
  if (!call) return { ok: false, reason: "call_not_found" };
  if (!TERMINAL_STATES.has(String(call.status))) {
    return { ok: true, skipped: true, reason: "not_terminal" };
  }
  const released = await releaseUnusedCallReservation(call);
  await finalizeEconomicTimelineForCall(call._id, call.user).catch(() => {});
  return released;
}
