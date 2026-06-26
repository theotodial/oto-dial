/**
 * Phase 0 — Roll back the Telecom Credit migration from a snapshot.
 *
 * Usage:
 *   node scripts/migration/rollback.mjs [snapshotName] --confirm
 *
 * Default snapshotName: telecom-credit-migration-v1
 * Requires --confirm to actually mutate data. Refuses to run without a complete manifest.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../../config/db.js";
import { restoreSnapshot, snapshotExists } from "../../src/services/migration/migrationSnapshotService.js";

dotenv.config();

const DEFAULT_SNAPSHOT = "telecom-credit-migration-v1";

async function run() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--confirm");
  const snapshotName = args.find((a) => !a.startsWith("--")) || DEFAULT_SNAPSHOT;

  await connectDB();
  console.log(`[rollback] connected. snapshotName='${snapshotName}'`);

  const exists = await snapshotExists(snapshotName);
  if (!exists) {
    console.error(`[rollback] no snapshot named '${snapshotName}' found. Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
    return;
  }

  if (!confirmed) {
    console.warn(
      `[rollback] DRY RUN. Pass --confirm to restore subscriptions/users/plans from '${snapshotName}'.`
    );
    await mongoose.disconnect();
    return;
  }

  const result = await restoreSnapshot({
    snapshotName,
    log: (msg) => console.log(msg),
  });

  console.log("[rollback] done", JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[rollback] FAILED", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
