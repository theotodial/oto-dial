import assert from "node:assert/strict";
import { test } from "node:test";

test("computeUserLoadProfile invalid id", async () => {
  const hot = await import("../src/services/hotUserIsolationService.js");
  const prof = await hot.computeUserLoadProfile("not-an-id");
  assert.equal(prof.ok, false);
});
