import assert from "node:assert/strict";
import { test } from "node:test";
import { claimAgentExecution, releaseAgentExecution } from "../src/services/distributedAgentCoordinator.js";

test("claimAgentExecution returns lease shape without Redis", async () => {
  const r = await claimAgentExecution("test-agent-coord-unit", 5000);
  assert.equal(r.acquired, true);
  assert.ok(r.ownerId);
  assert.ok(r.expiresAt);
  assert.ok(["memory_fallback", "redis_error_fallback", "redis"].includes(r.source));
  if (r.source === "redis") {
    await releaseAgentExecution("test-agent-coord-unit", r.ownerId);
  }
});
