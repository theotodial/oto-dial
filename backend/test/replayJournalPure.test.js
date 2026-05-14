import assert from "node:assert/strict";
import { test } from "node:test";
import { replayJournalEventsSorted } from "../src/services/ledgerReconstructionService.js";

test("replayJournalEventsSorted: reserve + debit + release", () => {
  const rows = [
    {
      eventType: "reserve",
      amount: 0,
      metadata: { reservedDelta: 10 },
    },
    {
      eventType: "attempt_charge",
      amount: -3,
      metadata: {},
    },
    {
      eventType: "release",
      amount: 0,
      metadata: { safeRelease: 10 },
    },
  ];
  const r = replayJournalEventsSorted(rows);
  assert.equal(r.balance, -3);
  assert.equal(r.reserved, 0);
  assert.equal(r.totalConsumed, 3);
});

test("replayJournalEventsSorted: settle reduces reserved only", () => {
  const rows = [
    { eventType: "reserve", amount: 0, metadata: { hold: 5 } },
    { eventType: "settle", amount: 0, metadata: { safeSettle: 5 } },
  ];
  const r = replayJournalEventsSorted(rows);
  assert.equal(r.balance, 0);
  assert.equal(r.reserved, 0);
});
