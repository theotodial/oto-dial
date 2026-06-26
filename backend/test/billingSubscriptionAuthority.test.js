import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSubscriptionPlanSnapshot,
  applyPlanSnapshotToSubscription,
} from "../src/services/subscriptionPlanSnapshotService.js";

test("subscription plan snapshot seeds telecom credit fields", () => {
  const plan = {
    limits: { minutesTotal: 50, creditsTotal: 75, smsTotal: 10, numbersTotal: 1 },
    monthlyCreditsLimit: 80,
  };
  const sub = {};
  applyPlanSnapshotToSubscription(sub, plan);
  assert.equal(sub.telecomCredits, 80);
  assert.equal(sub.remainingCredits, 80);
  assert.equal(sub.reservedCredits, 0);
});

test("buildSubscriptionPlanSnapshot keeps explicit creditsTotal", () => {
  const snap = buildSubscriptionPlanSnapshot({
    limits: { minutesTotal: 10, creditsTotal: 25, smsTotal: 5, numbersTotal: 1 },
  });
  assert.equal(snap.limits.creditsTotal, 25);
});

