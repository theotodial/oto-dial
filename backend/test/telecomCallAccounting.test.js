import test from "node:test";
import assert from "node:assert/strict";
import {
  CALL_STATES,
  canTransitionTo,
  PRE_ANSWER_CALL_STATUSES,
} from "../src/utils/callStateMachine.js";
import {
  TELECOM_PRICING,
  resolveCountryMultiplier,
  scaledCredits,
} from "../src/config/telecomPricingConfig.js";
import { computeExpectedIntervalCredits } from "../src/services/telecomCallAccountingService.js";

test("early-media state is reachable from ringing and dialing", () => {
  assert.equal(canTransitionTo(CALL_STATES.DIALING, CALL_STATES.EARLY_MEDIA), true);
  assert.equal(canTransitionTo(CALL_STATES.RINGING, CALL_STATES.EARLY_MEDIA), true);
  assert.equal(canTransitionTo(CALL_STATES.EARLY_MEDIA, CALL_STATES.ANSWERED), true);
  assert.deepEqual(PRE_ANSWER_CALL_STATUSES, [
    CALL_STATES.DIALING,
    CALL_STATES.RINGING,
    CALL_STATES.EARLY_MEDIA,
  ]);
});

test("country multiplier defaults to US for +1 destinations", () => {
  assert.equal(resolveCountryMultiplier("+14155551212"), TELECOM_PRICING.countryMultipliers.US);
  assert.equal(scaledCredits(3, 1), 3);
  assert.equal(scaledCredits(3, 1.5), 4.5);
});

test("pre-answer interval credit estimate uses 6-second buckets", () => {
  assert.equal(
    computeExpectedIntervalCredits(7, TELECOM_PRICING.perPreAnswerIntervalSeconds, 1),
    2
  );
  assert.equal(computeExpectedIntervalCredits(0, 6, 1), 0);
});
