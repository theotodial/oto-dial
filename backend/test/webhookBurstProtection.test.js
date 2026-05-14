import assert from "node:assert/strict";
import { test } from "node:test";

test("burst suppression kinds are boolean", async () => {
  const b = await import("../src/services/webhookBurstProtectionService.js");
  const dup = b.shouldSuppressNonCriticalWebhookWork("duplicate_telemetry");
  const dbg = b.shouldSuppressNonCriticalWebhookWork("debug_log");
  assert.equal(typeof dup, "boolean");
  assert.equal(typeof dbg, "boolean");
});
