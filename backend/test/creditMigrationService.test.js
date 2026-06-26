import test from "node:test";
import assert from "node:assert/strict";
import { migrateUserMinutesToCredits } from "../src/services/creditMigrationService.js";

test("migration skips under v1 (authoritative reset path)", async () => {
  const r = await migrateUserMinutesToCredits({
    _id: "507f1f77bcf86cd799439011",
    remainingCredits: 10,
    remainingMinutes: 0,
  });
  assert.equal(r.ok, true);
  assert.equal(r.skipped, true);
  assert.equal(r.reason, "v1_reset_migration_authoritative");
});

