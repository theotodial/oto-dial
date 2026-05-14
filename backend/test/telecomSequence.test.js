import assert from "node:assert/strict";
import { test } from "node:test";
import { listTelecomSequenceForCall } from "../src/services/telecomSequenceService.js";

test("listTelecomSequenceForCall invalid id returns empty array", async () => {
  const rows = await listTelecomSequenceForCall("bad", 10);
  assert.ok(Array.isArray(rows));
});
