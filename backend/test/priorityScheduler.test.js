import assert from "node:assert/strict";
import { test } from "node:test";

test("CRITICAL tasks still run under synthetic pressure", async () => {
  const bp = await import("../src/services/telecomBackpressureService.js");
  for (let i = 0; i < 200; i += 1) bp.recordSocketEmit();
  const sched = await import("../src/services/telecomPriorityScheduler.js");
  const out = await sched.scheduleTelecomTask("CRITICAL", async () => 42);
  assert.equal(out.ok, true);
  assert.equal(out.result, 42);
});
