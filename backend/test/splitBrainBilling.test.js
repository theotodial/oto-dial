import assert from "node:assert/strict";
import { test } from "node:test";

function findDuplicateIntervalGroups(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = `${r.call}|${r.idx}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].filter(([, c]) => c > 1);
}

test("duplicate interval index grouping", () => {
  const rows = [
    { call: "a", idx: 1 },
    { call: "a", idx: 1 },
    { call: "a", idx: 2 },
  ];
  const d = findDuplicateIntervalGroups(rows);
  assert.equal(d.length, 1);
  assert.equal(d[0][1], 2);
});
