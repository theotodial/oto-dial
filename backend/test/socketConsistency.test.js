import assert from "node:assert/strict";
import { test } from "node:test";

test("socket consistency module exports broadcast (load smoke)", async () => {
  const mod = await import("../src/services/socketConsistencyService.js");
  assert.equal(typeof mod.broadcastAuthoritativeCallState, "function");
});
