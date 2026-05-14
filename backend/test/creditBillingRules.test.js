import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_RULES } from "../src/config/creditConfig.js";

function intervals(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  if (s <= 0) return 0;
  return Math.ceil(s / CREDIT_RULES.connectedIntervalSeconds);
}

test("connected call interval rounding uses exact 6-second buckets", () => {
  assert.equal(CREDIT_RULES.connectedIntervalSeconds, 6);
  assert.equal(intervals(1), 1);
  assert.equal(intervals(6), 1);
  assert.equal(intervals(7), 2);
  assert.equal(intervals(12), 2);
  assert.equal(intervals(13), 3);
});

test("official credit constants match production billing policy", () => {
  assert.equal(CREDIT_RULES.outboundAttemptCharge, 1);
  assert.equal(CREDIT_RULES.connectedIntervalCharge, 1);
  assert.equal(CREDIT_RULES.smsOutboundCharge, 10);
  assert.equal(CREDIT_RULES.callReservationMinimum, 3);
});
