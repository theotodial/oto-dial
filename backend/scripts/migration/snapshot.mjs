/**
 * Phase 0 — Capture a pre-migration snapshot for the Telecom Credit migration.
 *
 * Usage:
 *   node scripts/migration/snapshot.mjs [snapshotName] [--force]
 *
 * Default snapshotName: telecom-credit-migration-v1
 * Idempotent: re-running with the same name is a no-op unless --force is passed.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../../config/db.js";
import { createSnapshot } from "../../src/services/migration/migrationSnapshotService.js";

dotenv.config();

const DEFAULT_SNAPSHOT = "telecom-credit-migration-v1";

async function run() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const snapshotName = args.find((a) => !a.startsWith("--")) || DEFAULT_SNAPSHOT;

  await connectDB();
  console.log(`[snapshot] connected. snapshotName='${snapshotName}' force=${force}`);

  const result = await createSnapshot({
    snapshotName,
    force,
    log: (msg) => console.log(msg),
  });

  console.log("[snapshot] done", JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[snapshot] FAILED", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
