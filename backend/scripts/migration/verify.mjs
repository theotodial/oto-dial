/**
 * Phase 7 — Telecom Credit migration verification (READ-ONLY).
 *
 *   node scripts/migration/verify.mjs [--snapshot <name>] [--strict-grants]
 *
 * Asserts: no negative balances, no orphan/duplicate active subscriptions, plan→credit grants,
 * purchased numbers preserved vs snapshot baseline, purchasable plans have Stripe prices, and
 * v1 rating spot-checks. Exits non-zero on any failure.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../../config/db.js";
import { runMigrationVerification } from "../../src/services/migration/migrationVerifyService.js";

dotenv.config();

const DEFAULT_SNAPSHOT = "telecom-credit-migration-v1";

async function run() {
  const args = process.argv.slice(2);
  const strictGrants = args.includes("--strict-grants");
  const snapIdx = args.indexOf("--snapshot");
  const snapshotName = snapIdx >= 0 ? args[snapIdx + 1] : DEFAULT_SNAPSHOT;

  await connectDB();
  console.log(`[verify] connected. snapshot='${snapshotName}' strictGrants=${strictGrants}\n`);

  const result = await runMigrationVerification({ snapshotName, strictGrants });

  console.log("[verify] summary:", JSON.stringify(result.summary, null, 2));
  if (result.warnings.length) {
    console.log(`\n[verify] WARNINGS (${result.warnings.length}):`);
    result.warnings.forEach((w) => console.log("  ⚠️  " + w));
  }
  if (result.failures.length) {
    console.log(`\n[verify] FAILURES (${result.failures.length}):`);
    result.failures.forEach((f) => console.log("  ❌ " + f));
  } else {
    console.log("\n[verify] ✅ all checks passed.");
  }

  await mongoose.disconnect();
  process.exit(result.ok ? 0 : 1);
}

run().catch(async (err) => {
  console.error("[verify] FAILED", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
