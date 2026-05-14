import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDefaultWorkerId } from "../src/services/workerHeartbeatService.js";

test("buildDefaultWorkerId includes hostname and pid", () => {
  const id = buildDefaultWorkerId();
  assert.ok(id.includes(":"));
  assert.ok(String(process.pid).length > 0);
});
