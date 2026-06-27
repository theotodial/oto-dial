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
import {
  billingTraceEnter,
  billingTraceExit,
  billingTraceReturn,
  traceCall,
} from "./billingRuntimeTraceService.js";

const ACTIVE_STATES = new Set(["answered", "in-progress"]);
const DURATION_BILLING_ACTIVE_STATUS = "in-progress";
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
  billingTraceEnter("callCreditBillingService.reserveCreditsForOutboundCall", {
    input: traceCall(call),
    options,
  });
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    billingTraceReturn("callCreditBillingService.reserveCreditsForOutboundCall", "not_outbound_or_missing_call_user", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping reserveCreditsForOutboundCall",
      { callId: String(call._id) }
    );
    billingTraceReturn("callCreditBillingService.reserveCreditsForOutboundCall", "debug_bypass", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true, debugBypass: true };
  }
  const result = await reserveCreditsForOutboundCallSerialized(call, options);
  if (!result || result.ok === false) {
    billingTraceReturn("callCreditBillingService.reserveCreditsForOutboundCall", result?.code || "reserve_failed", {
      input: traceCall(call),
      result,
    });
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
  const out = { ok: true, hold, billing, reservationMultiplier: result.reservationMultiplier };
  billingTraceExit("callCreditBillingService.reserveCreditsForOutboundCall", {
    input: traceCall(call),
    hold,
    result: out,
  });
  return out;
}

/**
 * Deduct 1 credit when the carrier accepts the outbound dial (ringing / provider leg live).
 * Idempotent per call — never double-charge the same attempt.
 */
export async function chargeProviderAcceptedAttempt(call, context = {}) {
  billingTraceEnter("callCreditBillingService.chargeProviderAcceptedAttempt", {
    input: traceCall(call),
    eventType: context.eventType || null,
    context,
    creditsToCharge: CREDIT_RULES.outboundAttemptCharge,
  });
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    billingTraceReturn("callCreditBillingService.chargeProviderAcceptedAttempt", "not_outbound_or_missing_call_user", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping chargeProviderAcceptedAttempt",
      { callId: String(call._id) }
    );
    billingTraceReturn("callCreditBillingService.chargeProviderAcceptedAttempt", "debug_bypass", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true, debugBypass: true };
  }

  if (call.attemptChargedAt || call.attemptCharged === true) {
    billingTraceReturn("callCreditBillingService.chargeProviderAcceptedAttempt", "already_charged", {
      input: traceCall(call),
    });
    return { ok: true, duplicate: true, skipped: true, reason: "already_charged" };
  }

  const result = await chargeOutboundAttemptSerialized(call);
  if (!result?.ok) {
    billingTraceReturn("callCreditBillingService.chargeProviderAcceptedAttempt", result?.code || result?.reason || "downstream_not_ok", {
      input: traceCall(call),
      result,
    });
    return result;
  }

  const billing = result?.billing;
  if (billing?.ok === false && billing?.code === "INSUFFICIENT_CREDITS") {
    billingTraceReturn("callCreditBillingService.chargeProviderAcceptedAttempt", "insufficient_credits", {
      input: traceCall(call),
      billing,
    });
    return billing;
  }

  await markAttemptChargedOnCall(call, billing, context);
  const out = { ok: true, billing, duplicate: Boolean(billing?.duplicate) };
  billingTraceExit("callCreditBillingService.chargeProviderAcceptedAttempt", {
    input: traceCall(call),
    result: out,
  });
  return out;
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

function logLifecycleDecision(call, eventName, decision, context = {}) {
  telecomStructuredLog("[TELECOM CHARGE DECISION]", {
    sourcePath: context.sourcePath || "callCreditBillingService.chargeCallLifecycleEvent",
    phase: "call_event_decision",
    decision,
    event: eventName || null,
    callId: call?._id ? String(call._id) : null,
    userId: call?.user ? String(call.user) : null,
    direction: call?.direction || null,
    status: call?.status || null,
    eventType: context.eventType || null,
  });
}

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
  const credits = rateCallEvent(eventName);
  billingTraceEnter("callCreditBillingService.chargeCallLifecycleEvent", {
    input: traceCall(call),
    eventType: context.eventType || null,
    eventName,
    creditsToCharge: credits,
    context,
  });
  if (!isRatingV1Enabled()) {
    logLifecycleDecision(call, eventName, "skipped_rating_v1_disabled", context);
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", "rating_v1_disabled", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
    });
    return { ok: true, skipped: true, reason: "rating_v1_disabled" };
  }
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    logLifecycleDecision(call, eventName, "skipped_not_outbound_or_missing_call_user", context);
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", "not_outbound_or_missing_call_user", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
    });
    return { ok: true, skipped: true, reason: "not_outbound" };
  }
  if (!V1_OUTBOUND_BILLABLE_EVENTS.has(eventName)) {
    logLifecycleDecision(call, eventName, "skipped_event_not_billable", context);
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", "event_not_billable", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
    });
    return { ok: true, skipped: true, reason: "event_not_billable" };
  }
  if (credits <= 0) {
    logLifecycleDecision(call, eventName, "skipped_zero_rated", context);
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", "zero_rated", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
    });
    return { ok: true, skipped: true, reason: "zero_rated" };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping chargeCallLifecycleEvent",
      { callId: String(call._id), eventName }
    );
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", "debug_bypass", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
    });
    return { ok: true, skipped: true, debugBypass: true };
  }

  // Fast-skip if already billed (ledger key remains the real idempotency authority).
  if (Array.isArray(call.billedCallEvents) && call.billedCallEvents.includes(eventName)) {
    logLifecycleDecision(call, eventName, "skipped_already_billed_event", context);
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", "already_billed_event", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
      idempotencyKey: `call:${String(call._id)}:event:${eventName}`,
    });
    return { ok: true, duplicate: true, skipped: true, reason: "already_billed_event" };
  }

  const result = await chargeCallEventSerialized(call, eventName);
  if (!result?.ok) {
    logLifecycleDecision(call, eventName, `failed_${result?.code || result?.reason || "unknown"}`, context);
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", result?.code || result?.reason || "downstream_not_ok", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
      result,
    });
    return result;
  }
  const billing = result?.billing;
  if (billing?.ok === false && billing?.code === "INSUFFICIENT_CREDITS") {
    logLifecycleDecision(call, eventName, "failed_insufficient_credits", context);
    billingTraceReturn("callCreditBillingService.chargeCallLifecycleEvent", "insufficient_credits", {
      input: traceCall(call),
      eventName,
      creditsToCharge: credits,
      billing,
    });
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

  const out = { ok: true, billing, eventName, credits, duplicate: Boolean(billing?.duplicate) };
  billingTraceExit("callCreditBillingService.chargeCallLifecycleEvent", {
    input: traceCall(call),
    eventName,
    creditsToCharge: credits,
    result: out,
  });
  return out;
}

/**
 * Answered calls that have already transitioned to a terminal status still owe any
 * completed connected-duration buckets. Present them as in-progress for billing only.
 */
export function callViewForDurationBilling(call) {
  if (!call?._id || !call?.user) return call;
  const answeredAt = call.callAnsweredAt || call.callStartedAt;
  if (!answeredAt) return call;
  if (ACTIVE_STATES.has(String(call.status || ""))) return call;
  const base = typeof call.toObject === "function" ? call.toObject() : { ...call };
  return {
    ...base,
    status: DURATION_BILLING_ACTIVE_STATUS,
    callAnsweredAt: answeredAt,
    callStartedAt: call.callStartedAt || answeredAt,
  };
}

export async function billConnectedDurationIntervals(call) {
  const billingCall = callViewForDurationBilling(call);
  billingTraceEnter("callCreditBillingService.billConnectedDurationIntervals", {
    input: traceCall(call),
    billingView: traceCall(billingCall),
    creditsToCharge: CREDIT_RULES.connectedIntervalCharge,
  });
  if (!billingCall?._id || !billingCall?.user) {
    billingTraceReturn("callCreditBillingService.billConnectedDurationIntervals", "missing_call_or_user", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true };
  }
  if (!ACTIVE_STATES.has(String(billingCall.status))) {
    billingTraceReturn("callCreditBillingService.billConnectedDurationIntervals", "not_active", {
      input: traceCall(call),
      billingView: traceCall(billingCall),
    });
    return { ok: true, skipped: true, reason: "not_active" };
  }
  const answeredAt = billingCall.callAnsweredAt || billingCall.callStartedAt;
  if (!answeredAt) {
    billingTraceReturn("callCreditBillingService.billConnectedDurationIntervals", "not_answered", {
      input: traceCall(call),
      billingView: traceCall(billingCall),
    });
    return { ok: true, skipped: true, reason: "not_answered" };
  }
  if (allowOutboundCreditDebugBypass()) {
    billingTraceReturn("callCreditBillingService.billConnectedDurationIntervals", "debug_bypass", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true, debugBypass: true };
  }

  const result = await billConnectedDurationIntervalsSerialized(billingCall);
  if (result?.ok && Number(result.chargedNow) > 0) {
    await Call.updateOne({ _id: billingCall._id }, { $set: { lastBillingAt: new Date() } });
  }
  billingTraceExit("callCreditBillingService.billConnectedDurationIntervals", {
    input: traceCall(call),
    billingView: traceCall(billingCall),
    result,
  });
  return result;
}

export async function releaseUnusedCallReservation(call) {
  billingTraceEnter("callCreditBillingService.releaseUnusedCallReservation", {
    input: traceCall(call),
  });
  if (!call?._id || !call?.user) {
    billingTraceReturn("callCreditBillingService.releaseUnusedCallReservation", "missing_call_or_user", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true };
  }
  const held = Math.max(0, Number(call.creditReservationHeld || 0));
  if (held <= 0) {
    billingTraceReturn("callCreditBillingService.releaseUnusedCallReservation", "nothing_held", {
      input: traceCall(call),
      held,
    });
    return { ok: true, skipped: true };
  }

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
      billingTraceReturn("callCreditBillingService.releaseUnusedCallReservation", "nothing_to_release", {
        input: traceCall(call),
        held,
        releasable,
      });
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
  billingTraceExit("callCreditBillingService.releaseUnusedCallReservation", {
    input: traceCall(call),
    held,
    result: billing,
  });
  return billing;
}

export async function stopCallDurationBilling(callId) {
  billingTraceEnter("callCreditBillingService.stopCallDurationBilling", {
    callId: callId ? String(callId) : null,
  });
  const call = await Call.findById(callId);
  if (!call) {
    billingTraceReturn("callCreditBillingService.stopCallDurationBilling", "call_not_found", {
      callId: callId ? String(callId) : null,
    });
    return { ok: false, reason: "call_not_found" };
  }
  if (!TERMINAL_STATES.has(String(call.status))) {
    billingTraceReturn("callCreditBillingService.stopCallDurationBilling", "not_terminal", {
      input: traceCall(call),
    });
    return { ok: true, skipped: true, reason: "not_terminal" };
  }
  const released = await releaseUnusedCallReservation(call);
  await finalizeEconomicTimelineForCall(call._id, call.user).catch(() => {});
  billingTraceExit("callCreditBillingService.stopCallDurationBilling", {
    input: traceCall(call),
    result: released,
  });
  return released;
}
