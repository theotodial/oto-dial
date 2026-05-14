import assert from "node:assert/strict";
import { test } from "node:test";

test("socket throttle collapses identical authoritative fingerprint", async () => {
  const { evaluateCallAuthoritativeEmit } = await import("../src/services/socketThrottleService.js");
  const uid = "60d5ec49f1b2c8b4f8a9e0d1";
  const payload = {
    callId: "507f1f77bcf86cd799439012",
    callStateVersion: 3,
    callStatus: "in-progress",
    economicVersion: 9,
    snapshot: { direction: "outbound" },
  };
  const a = evaluateCallAuthoritativeEmit(uid, payload);
  const b = evaluateCallAuthoritativeEmit(uid, payload);
  assert.equal(a.allow, true);
  assert.equal(b.allow, false);
});
