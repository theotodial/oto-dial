import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPayload } from "../src/agents/shared/webhookPayloadHash.js";

test("webhook payload hash stable for dedup correlation", () => {
  const a = hashPayload({ x: 1, y: 2 });
  const b = hashPayload({ y: 2, x: 1 });
  assert.equal(a, b);
});
