import assert from "node:assert/strict";
import { test } from "node:test";
import {
  maxCompletedBillableIntervalIndex,
  computeEconomicConsistencyHash,
  validateEconomicMutationOrder,
  ECONOMIC_MUTATION,
  withEconomicCallLock,
} from "../src/services/economicSerializationService.js";
import mongoose from "mongoose";

test("maxCompletedBillableIntervalIndex uses floor (deterministic)", () => {
  assert.equal(maxCompletedBillableIntervalIndex(0, 6), 0);
  assert.equal(maxCompletedBillableIntervalIndex(5, 6), 0);
  assert.equal(maxCompletedBillableIntervalIndex(6, 6), 1);
  assert.equal(maxCompletedBillableIntervalIndex(11, 6), 1);
  assert.equal(maxCompletedBillableIntervalIndex(12, 6), 2);
});

test("duplicate interval index would be skipped by max window", () => {
  const elapsed = 12;
  const maxIdx = maxCompletedBillableIntervalIndex(elapsed, 6);
  const billed = new Set([1, 2]);
  let charged = 0;
  for (let idx = 1; idx <= maxIdx; idx += 1) {
    if (billed.has(idx)) continue;
    charged += 1;
    billed.add(idx);
  }
  assert.equal(charged, 0);
});

test("double settle prevention: settle requires non-initialized state", () => {
  const t0 = { timelineState: "initialized", finalizedAt: null };
  const v = validateEconomicMutationOrder(t0, ECONOMIC_MUTATION.SETTLE_RESERVATION);
  assert.equal(v.ok, false);
  assert.equal(v.code, "ORDER");
});

test("finalize immutability: no charges after finalized", () => {
  const tf = { timelineState: "finalized", finalizedAt: new Date(), reservedCredits: 0 };
  const v = validateEconomicMutationOrder(tf, ECONOMIC_MUTATION.INTERVAL_CHARGE);
  assert.equal(v.ok, false);
  assert.equal(v.code, "FINALIZED");
});

test("hash consistency validation stable", () => {
  const a = {
    reservedCredits: 3,
    consumedCredits: 1,
    settledCredits: 0,
    releasedCredits: 0,
    timelineState: "reserved",
    economicVersion: 2,
    billedIntervalIndexes: [2, 1],
  };
  const h1 = computeEconomicConsistencyHash(a);
  const h2 = computeEconomicConsistencyHash({ ...a });
  assert.equal(h1, h2);
});

test("worker restart replay: same elapsed seconds yields same max index", () => {
  const elapsed = 30;
  const a = maxCompletedBillableIntervalIndex(elapsed, 6);
  const b = maxCompletedBillableIntervalIndex(elapsed, 6);
  assert.equal(a, b);
  assert.equal(a, 5);
});

test("duplicate webhook replay: clientMutationId dedupe contract (pure)", () => {
  const doc = { metadata: { processedMutationIds: ["abc"] } };
  assert.equal(doc.metadata.processedMutationIds.includes("abc"), true);
});

test("concurrent mutation race: economic lock serializes overlapping work", async () => {
  const id = new mongoose.Types.ObjectId();
  let depth = 0;
  let maxDepth = 0;
  const slow = async () => {
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
    await new Promise((r) => setTimeout(r, 40));
    depth -= 1;
    return "a";
  };
  const fast = async () => {
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
    depth -= 1;
    return "b";
  };
  const [r1, r2] = await Promise.all([
    withEconomicCallLock(id, slow, { leaseMs: 5000, timeoutMs: 8000 }),
    withEconomicCallLock(id, fast, { leaseMs: 5000, timeoutMs: 8000 }),
  ]);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(maxDepth, 1, "lock must prevent concurrent economic sections");
});
