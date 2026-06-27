import test from "node:test";
import assert from "node:assert/strict";
import { callViewForDurationBilling } from "../src/services/callCreditBillingService.js";
import { maxCompletedBillableIntervalIndex } from "../src/services/economicSerializationService.js";
import { CREDIT_RULES } from "../src/config/creditConfig.js";

test("callViewForDurationBilling upgrades terminal answered calls for catch-up", () => {
  const answeredAt = new Date(Date.now() - 60_000);
  const call = {
    _id: "abc",
    user: "user1",
    status: "completed",
    callAnsweredAt: answeredAt,
    callStartedAt: answeredAt,
  };
  const view = callViewForDurationBilling(call);
  assert.equal(view.status, "in-progress");
  assert.equal(view.callAnsweredAt, answeredAt);
});

test("callViewForDurationBilling leaves active calls unchanged", () => {
  const call = {
    _id: "abc",
    user: "user1",
    status: "in-progress",
    callAnsweredAt: new Date(),
  };
  const view = callViewForDurationBilling(call);
  assert.equal(view.status, "in-progress");
  assert.equal(view, call);
});

test("60s answered call expects lifecycle plus connected buckets", () => {
  const lifecycle = 2 + 4 + 5;
  const durationBuckets = maxCompletedBillableIntervalIndex(60, CREDIT_RULES.connectedIntervalSeconds);
  const durationCredits = durationBuckets * CREDIT_RULES.connectedIntervalCharge;
  assert.equal(lifecycle, 11);
  assert.equal(durationBuckets, 10);
  assert.equal(durationCredits, 15);
  assert.equal(lifecycle + durationCredits, 26);
});
