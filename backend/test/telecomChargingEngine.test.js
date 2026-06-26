import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_RULES } from "../src/config/creditConfig.js";
import {
  computeExpectedCallCredits,
  computeExpectedIntervalCredits,
} from "../src/services/telecomCallAccountingService.js";
import { allowOutboundCreditDebugBypass } from "../src/utils/outboundCreditDebugBypass.js";

test("expected credits: no-answer is 1 attempt only", () => {
  assert.equal(computeExpectedCallCredits({ answeredSeconds: 0, attemptCharged: true }), 1);
});

test("expected credits: 12s answered = 1 attempt + 2 intervals (v1)", () => {
  const perInterval = CREDIT_RULES.connectedIntervalCharge;
  assert.equal(
    computeExpectedCallCredits({ answeredSeconds: 12, attemptCharged: true }),
    1 + computeExpectedIntervalCredits(12, CREDIT_RULES.connectedIntervalSeconds, perInterval)
  );
  assert.equal(computeExpectedCallCredits({ answeredSeconds: 12, attemptCharged: true }), 4);
});

test("expected credits: 30s answered = 1 attempt + 5 intervals (v1)", () => {
  assert.equal(computeExpectedCallCredits({ answeredSeconds: 30, attemptCharged: true }), 8.5);
});

test("expected credits: 18s answered = 1 attempt + 3 intervals (v1)", () => {
  assert.equal(computeExpectedCallCredits({ answeredSeconds: 18, attemptCharged: true }), 5.5);
});

test("debug bypass is opt-in only (not auto development)", () => {
  const prevNode = process.env.NODE_ENV;
  const prevBypass = process.env.CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS;
  const prevForce = process.env.CALL_DEBUG_FORCE_REAL_BILLING;
  try {
    process.env.NODE_ENV = "development";
    delete process.env.CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS;
    delete process.env.CALL_DEBUG_FORCE_REAL_BILLING;
    assert.equal(allowOutboundCreditDebugBypass(), false);
    process.env.CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS = "true";
    assert.equal(allowOutboundCreditDebugBypass(), true);
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prevBypass === undefined) delete process.env.CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS;
    else process.env.CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS = prevBypass;
    if (prevForce === undefined) delete process.env.CALL_DEBUG_FORCE_REAL_BILLING;
    else process.env.CALL_DEBUG_FORCE_REAL_BILLING = prevForce;
  }
});
