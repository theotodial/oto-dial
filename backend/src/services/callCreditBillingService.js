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

const ACTIVE_STATES = new Set(["answered", "in-progress"]);
const TERMINAL_STATES = new Set([
  "completed",
  "failed",
  "rejected",
  "canceled",
  "busy",
  "no-answer",
]);

export async function reserveCreditsForOutboundCall(call, options = {}) {
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    return { ok: true, skipped: true };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn("[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping reserveCreditsForOutboundCall", {
      callId: String(call._id),
    });
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

export async function chargeOutboundAttempt(call) {
  if (!call?._id || !call?.user || call.direction !== "outbound") {
    return { ok: true, skipped: true };
  }
  if (allowOutboundCreditDebugBypass()) {
    console.warn("[CALL DEBUG] CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS — skipping chargeOutboundAttempt", {
      callId: String(call._id),
    });
    return { ok: true, skipped: true, debugBypass: true };
  }
  const key = `call:${String(call._id)}:attempt`;
  const result = await chargeOutboundAttemptSerialized(call);
  const billing = result?.billing;
  if (result?.ok && billing && !billing.duplicate) {
    await Call.updateOne(
      { _id: call._id },
      {
        $set: {
          attemptChargedAt: new Date(),
          attemptChargeIdempotencyKey: key,
          durationBillingCursorAt: call.callAnsweredAt || call.callStartedAt || null,
        },
      }
    );
  }
  return billing || result;
}

export async function billConnectedDurationIntervals(call) {
  if (!call?._id || !call?.user) return { ok: true, skipped: true };
  if (!ACTIVE_STATES.has(String(call.status))) {
    return { ok: true, skipped: true, reason: "not_active" };
  }
  const answeredAt = call.callAnsweredAt || call.callStartedAt;
  if (!answeredAt) return { ok: true, skipped: true, reason: "not_answered" };
  return billConnectedDurationIntervalsSerialized(call);
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
