import assert from "node:assert/strict";
import { test } from "node:test";

test("clock drift threshold default", () => {
  const drift = Math.max(1000, Number(process.env.CHAOS_CLOCK_DRIFT_MS || 2500));
  assert.equal(drift >= 2500, true);
});
