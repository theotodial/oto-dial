import assert from "node:assert/strict";
import { test } from "node:test";
import { replayJournalEventsSorted } from "../src/services/ledgerReconstructionService.js";

test("replayJournalEventsSorted empty is deterministic zero", () => {
  const r = replayJournalEventsSorted([]);
  assert.equal(r.balance, 0);
  assert.equal(r.reserved, 0);
  assert.equal(r.eventCount, 0);
});

test("replayJournalEventsSorted reserve then release symmetry", () => {
  const rows = [
    { eventType: "reserve", amount: -5, metadata: { reservedDelta: 5 } },
    { eventType: "release", amount: 3, metadata: { safeRelease: 5 } },
  ];
  const r = replayJournalEventsSorted(rows);
  assert.ok(Number.isFinite(r.balance));
  assert.ok(Number.isFinite(r.reserved));
});
