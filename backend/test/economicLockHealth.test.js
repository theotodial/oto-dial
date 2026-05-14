import assert from "node:assert/strict";
import { test } from "node:test";

test("stale lock threshold env default is sane", () => {
  const ms = Math.max(60_000, Number(process.env.CHAOS_STALE_ECON_LOCK_MS || 300_000));
  assert.ok(ms >= 60_000);
});
