import Call from "../models/Call.js";
import { CREDIT_RULES } from "../config/creditConfig.js";
import {
  reserveCreditsForOutboundCallSerialized,
  chargeOutboundAttemptSerialized,
  billConnectedDurationIntervalsSerialized,
  releaseUnusedCallReservationSerialized,
  finalizeEconomicTimelineForCall,
} from "./economicSerializationService.js";
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
  const billing = result?.billing;
  if (result?.ok && billing && !billing.duplicate) {
    await Call.updateOne(
      { _id: call._id },
      {
        $set: {
          creditReservationHeld: result.hold,
          "riskPricing.reservationMultiplier": result.reservationMultiplier,
          "riskPricing.reservationHeld": result.hold,
        },
      }
    );
  }
  return billing || result;
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
