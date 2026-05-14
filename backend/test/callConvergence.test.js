import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCanonicalCallSnapshot } from "../src/services/callConvergenceService.js";

test("computeCanonicalCallSnapshot rejects invalid call id", async () => {
  const r = await computeCanonicalCallSnapshot("not-an-objectid");
  assert.equal(r.ok, false);
  assert.equal(r.code, "invalid_call_id");
});
