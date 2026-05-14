import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listPendingIntervalIndexes,
  computePendingIntervalExposureForCall,
} from "../src/services/projectedBalanceService.js";
import { CREDIT_RULES } from "../src/config/creditConfig.js";

test("listPendingIntervalIndexes excludes billed indexes", () => {
  assert.deepEqual(listPendingIntervalIndexes(3, [1, 2]), [3]);
  assert.deepEqual(listPendingIntervalIndexes(3, []), [1, 2, 3]);
  assert.deepEqual(listPendingIntervalIndexes(0, []), []);
});

test("computePendingIntervalExposureForCall merges legacy durationCreditsCharged into billed set", () => {
  const answered = new Date(Date.now() - 13 * 1000);
  const call = {
    callAnsweredAt: answered,
    durationCreditsCharged: 1,
  };
  const tl = { billedIntervalIndexes: [1] };
  const { pendingIndexes, pendingCredits, maxBillableIndex } = computePendingIntervalExposureForCall(
    call,
    tl,
    Date.now()
  );
  assert.equal(maxBillableIndex, 2);
  assert.deepEqual(pendingIndexes, [2]);
  assert.equal(pendingCredits, pendingIndexes.length * CREDIT_RULES.connectedIntervalCharge);
});

test("computePendingIntervalExposureForCall: no answer time yields zero exposure", () => {
  const r = computePendingIntervalExposureForCall({}, {}, Date.now());
  assert.deepEqual(r.pendingIndexes, []);
  assert.equal(r.pendingCredits, 0);
});

test("replay-stable pending: same clock and state yields identical pending indexes", () => {
  const now = 1_700_000_000_000;
  const answered = new Date(now - 30 * 1000);
  const call = { callAnsweredAt: answered, durationCreditsCharged: 0 };
  const tl = { billedIntervalIndexes: [1, 2, 3] };
  const a = computePendingIntervalExposureForCall(call, tl, now);
  const b = computePendingIntervalExposureForCall(call, tl, now);
  assert.deepEqual(a.pendingIndexes, b.pendingIndexes);
});
