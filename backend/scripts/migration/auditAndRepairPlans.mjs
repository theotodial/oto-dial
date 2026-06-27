/**
 * Audit and repair subscription plan mappings after the Telecom Credit migration.
 *
 *   node scripts/migration/auditAndRepairPlans.mjs [--repair] [--dry-run] [--snapshot <name>]
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../../config/db.js";
import {
  auditMigrationPlanMappings,
  repairAllMigrationPlanMappings,
} from "../../src/services/migration/migrationPlanResolver.js";

dotenv.config();

async function run() {
  const args = process.argv.slice(2);
  const repair = args.includes("--repair");
  const dryRun = args.includes("--dry-run");
  const snapIdx = args.indexOf("--snapshot");
  const snapshotName = snapIdx >= 0 ? args[snapIdx + 1] : "telecom-credit-migration-v1";

  await connectDB();
  console.log(`[auditAndRepairPlans] connected. repair=${repair} dryRun=${dryRun} snapshot=${snapshotName}`);

  if (repair) {
    const { audit, results } = await repairAllMigrationPlanMappings({ snapshotName, dryRun });
    console.log("\n========== MIGRATION PLAN AUDIT (POST-REPAIR) ==========");
    console.log(JSON.stringify(audit, null, 2));
    console.log("\n========== REPAIR RESULTS ==========");
    console.log(JSON.stringify(results, null, 2));
    console.log("\nSummary:", {
      incorrectlyMappedUsers: audit.incorrectlyMappedUsers,
      correctedUsers: audit.correctedUsers,
      manualReview: audit.manualReview,
      repairedThisRun: results.filter((r) => r.repaired).length,
    });
  } else {
    const audit = await auditMigrationPlanMappings({ snapshotName });
    console.log("\n========== MIGRATION PLAN AUDIT ==========");
    console.log(JSON.stringify(audit, null, 2));
    if (audit.mismatches.length) {
      console.log("\nMismatches:");
      audit.mismatches.forEach((m) => {
        console.log(
          `  user=${m.userId} sub=${m.subscriptionId} ${m.currentFamily}→${m.targetFamily} (${m.currentPlanName} → ${m.targetPlanName}) [${m.evidenceSource}]`
        );
      });
    }
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[auditAndRepairPlans] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
