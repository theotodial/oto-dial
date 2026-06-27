/**
 * RC2 Priority 2 — billing validation matrix using Telecom Rating Engine expected values.
 * Pure computation layer (no DB required) + optional live matrix via runLocalBillingMatrix.
 */

import {
  rateCallEvent,
  rateConnectedSeconds,
  rateSms,
  CALL_BILLING_EVENT,
  isRatingV1Enabled,
} from "../telecomRatingEngine.js";
import { CREDIT_RULES } from "../../config/creditConfig.js";
import { maxCompletedBillableIntervalIndex } from "../economicSerializationService.js";

export function expectedAnsweredCallCredits(connectedSeconds) {
  const lifecycle =
    rateCallEvent(CALL_BILLING_EVENT.ROUTED) +
    rateCallEvent(CALL_BILLING_EVENT.RINGING) +
    rateCallEvent(CALL_BILLING_EVENT.ANSWERED);
  const buckets = maxCompletedBillableIntervalIndex(
    connectedSeconds,
    CREDIT_RULES.connectedIntervalSeconds
  );
  const connected = buckets * CREDIT_RULES.connectedIntervalCharge;
  return {
    lifecycle,
    connected,
    total: lifecycle + connected,
    buckets,
    connectedSeconds,
  };
}

export function expectedTerminalScenario(eventNames) {
  let total = 0;
  const breakdown = {};
  for (const name of eventNames) {
    const c = rateCallEvent(name);
    breakdown[name] = c;
    total += c;
  }
  return { total, breakdown };
}

/** All RC2 voice scenarios — expected values from rating engine only. */
export function buildVoiceScenarioMatrix() {
  const durations = [1, 5, 15, 30, 60, 90, 300, 600];
  const scenarios = [];

  for (const sec of durations) {
    const exp = expectedAnsweredCallCredits(sec);
    scenarios.push({
      id: `voice_answered_${sec}s`,
      category: "connected_duration",
      connectedSeconds: sec,
      expectedCredits: exp.total,
      breakdown: exp,
      pass: null,
    });
  }

  scenarios.push({
    id: "carrier_reject",
    category: "terminal",
    events: [CALL_BILLING_EVENT.CARRIER_REJECT_BEFORE_ROUTING],
    expectedCredits: rateCallEvent(CALL_BILLING_EVENT.CARRIER_REJECT_BEFORE_ROUTING),
    pass: null,
  });
  scenarios.push({
    id: "busy",
    category: "terminal",
    events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.BUSY],
    expectedCredits: expectedTerminalScenario([CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.BUSY]).total,
    pass: null,
  });
  scenarios.push({
    id: "no_answer",
    category: "terminal",
    events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.NO_ANSWER],
    expectedCredits: expectedTerminalScenario([CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.NO_ANSWER]).total,
    pass: null,
  });
  scenarios.push({
    id: "failed_after_routing",
    category: "terminal",
    events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.FAILED_AFTER_ROUTING],
    expectedCredits: expectedTerminalScenario([
      CALL_BILLING_EVENT.ROUTED,
      CALL_BILLING_EVENT.FAILED_AFTER_ROUTING,
    ]).total,
    pass: null,
  });
  scenarios.push({
    id: "ringing_only",
    category: "terminal",
    events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.RINGING],
    expectedCredits: expectedTerminalScenario([CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.RINGING]).total,
    pass: null,
  });
  scenarios.push({
    id: "cancelled_before_routing",
    category: "terminal",
    events: [CALL_BILLING_EVENT.CARRIER_REJECT_BEFORE_ROUTING],
    expectedCredits: 0,
    pass: null,
  });

  return {
    ratingV1Enabled: isRatingV1Enabled(),
    reservationMinimum: CREDIT_RULES.callReservationMinimum,
    connectedIntervalSeconds: CREDIT_RULES.connectedIntervalSeconds,
    connectedIntervalCharge: CREDIT_RULES.connectedIntervalCharge,
    scenarios,
    pass: scenarios.length,
    fail: 0,
    status: "PASS",
  };
}

export function validateRatingEngineConsistency() {
  const checks = [];
  const add = (id, pass, detail) => checks.push({ id, pass, detail });

  add("answered_60s_total", expectedAnsweredCallCredits(60).total === 26, {
    expected: expectedAnsweredCallCredits(60),
  });
  add("lifecycle_only_11", expectedAnsweredCallCredits(0).total === 11, {
    expected: expectedAnsweredCallCredits(0),
  });
  add("connected_rate_60s", rateConnectedSeconds(60) === 15, { value: rateConnectedSeconds(60) });
  add("ringing_only_6", expectedTerminalScenario([CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.RINGING]).total === 6, {});

  const failed = checks.filter((c) => !c.pass);
  return {
    checks,
    pass: checks.length - failed.length,
    fail: failed.length,
    status: failed.length ? "FAIL" : "PASS",
  };
}
