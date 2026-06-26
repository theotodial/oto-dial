import Call from "../models/Call.js";
import CreditLedger from "../models/CreditLedger.js";
import { normalizeCallStatus, isTerminalStatus } from "../utils/callStateMachine.js";
import { telecomStructuredLog } from "../utils/telecomStructuredLog.js";
import { TELECOM_PRICING, resolveCountryMultiplier, scaledCredits } from "../config/telecomPricingConfig.js";
import { CREDIT_RULES } from "../config/creditConfig.js";
import { isRatingV1Enabled } from "./telecomRatingEngine.js";
import {
  billConnectedDurationIntervals,
  stopCallDurationBilling,
} from "./callCreditBillingService.js";

/**
 * Sum actual telecom credit debits posted for a call from the ledger (system of record).
 * Used under v1 so the per-call accounting snapshot always reconciles with CreditLedger.
 */
async function sumLedgerChargesForCall(callId) {
  const rows = await CreditLedger.find({
    callId,
    type: { $in: ["call_event_charge", "connected_duration_charge", "outbound_attempt_charge"] },
  })
    .select("amount type")
    .lean();
  let eventCredits = 0;
  let durationCredits = 0;
  for (const r of rows) {
    const debit = Math.max(0, -Number(r.amount || 0));
    if (r.type === "connected_duration_charge") durationCredits += debit;
    else eventCredits += debit;
  }
  return {
    eventCredits: Math.round(eventCredits * 10000) / 10000,
    durationCredits: Math.round(durationCredits * 10000) / 10000,
  };
}

function destinationForCall(call) {
  return call?.toNumber || call?.phoneNumber || "";
}

/**
 * Persist authoritative telecom accounting snapshot on a call row.
 */
export async function finalizeTelecomCallAccounting(callId, context = {}) {
  const call = await Call.findById(callId);
  if (!call?._id) return { ok: false, reason: "call_not_found" };

  const status = normalizeCallStatus(call.status);
  if (!isTerminalStatus(status) && !context.forceWhileActive) {
    return { ok: true, skipped: true, reason: "not_terminal" };
  }

  if (call.direction === "outbound" && isTerminalStatus(status)) {
    await billConnectedDurationIntervals(call).catch(() => {});
    await stopCallDurationBilling(call._id).catch(() => {});
  }

  const refreshed = await Call.findById(callId);
  if (!refreshed) return { ok: false, reason: "call_not_found" };

  const v1 = isRatingV1Enabled();
  let attemptCredits;
  let durationCredits;
  if (v1) {
    // Authoritative: reconcile snapshot to actual ledger debits (milestones + connected).
    const led = await sumLedgerChargesForCall(refreshed._id);
    attemptCredits = led.eventCredits;
    durationCredits = led.durationCredits;
  } else {
    attemptCredits = refreshed.attemptChargedAt || refreshed.attemptCharged ? 1 : 0;
    durationCredits = Math.max(0, Number(refreshed.durationCreditsCharged || 0));
  }
  const totalCreditsCharged = Math.round((attemptCredits + durationCredits) * 10000) / 10000;
  const multiplier = resolveCountryMultiplier(destinationForCall(refreshed));
  const finalCharge = v1
    ? scaledCredits(totalCreditsCharged, multiplier)
    : Math.ceil(totalCreditsCharged * multiplier);

  const trulyAnswered = Boolean(refreshed.callAnsweredAt);
  const finalDurationSeconds = trulyAnswered
    ? Math.max(0, Number(refreshed.billedSeconds || refreshed.durationSeconds || 0))
    : 0;

  let billingReason = "terminal_no_charge";
  if (attemptCredits > 0 && durationCredits > 0) {
    billingReason = "attempt_plus_connected_intervals";
  } else if (attemptCredits > 0) {
    billingReason = "outbound_attempt_only";
  } else if (durationCredits > 0) {
    billingReason = "connected_duration_only";
  }

  const patch = {
    callCost: totalCreditsCharged,
    carrierCost: Number(refreshed.cost || 0),
    billableSeconds: finalDurationSeconds,
    finalDurationSeconds,
    billedAttempts: attemptCredits,
    attemptCredits,
    durationCredits,
    activeCreditsCharged: durationCredits,
    totalCreditsCharged,
    billingReason,
    finalCharge,
    terminationSource:
      context.terminationSource ||
      refreshed.terminationSource ||
      refreshed.lastEventSource ||
      null,
    telecomAccountingFinalizedAt: new Date(),
  };

  await Call.updateOne({ _id: refreshed._id }, { $set: patch });

  telecomStructuredLog("[CALL TERMINATION]", {
    sourcePath: context.sourcePath || "telecomCallAccountingService.js",
    callId: String(refreshed._id),
    userId: refreshed.user ? String(refreshed.user) : null,
    billingReason,
    totalCreditsCharged,
    attemptCredits,
    durationCredits,
    finalDurationSeconds,
    eventType: context.eventType || null,
  });

  return {
    ok: true,
    totalCreditsCharged,
    finalCharge,
    billingReason,
    attemptCredits,
    durationCredits,
  };
}

export function computeExpectedIntervalCredits(seconds, intervalSeconds, perIntervalCredits) {
  const s = Math.max(0, Number(seconds) || 0);
  const bucket = Math.max(1, Number(intervalSeconds) || CREDIT_RULES.connectedIntervalSeconds);
  if (s <= 0) return 0;
  return Math.ceil(s / bucket) * Math.max(0, Number(perIntervalCredits) || 0);
}

export function computeExpectedCallCredits({ answeredSeconds = 0, attemptCharged = true } = {}) {
  const attempt = attemptCharged ? TELECOM_PRICING.perAttemptCredits : 0;
  const connected = computeExpectedIntervalCredits(
    answeredSeconds,
    TELECOM_PRICING.perConnectedIntervalSeconds,
    TELECOM_PRICING.perConnectedIntervalCredits
  );
  return attempt + connected;
}
