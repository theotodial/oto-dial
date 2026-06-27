#!/usr/bin/env node
/**
 * RC2 Priority 1 — Complete production plan audit.
 *
 *   node scripts/auditProductionPlans.mjs [--dry-run] [--repair] [--user <id>] [--snapshot <name>]
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { parseCliArgs } from "../src/services/production/productionAuditCommon.js";
import {
  auditProductionPlans,
  repairProductionPlans,
} from "../src/services/production/productionPlanAuditService.js";

const args = parseCliArgs();

async function run() {
  await connectDB();
  const options = {
    userId: args.userId,
    snapshotName: args.snapshotName,
    dryRun: args.dryRun,
    limit: args.limit,
  };

  const result = args.repair
    ? await repairProductionPlans(options)
    : { audit: await auditProductionPlans(options) };

  const audit = result.audit;
  console.log("\n========== PRODUCTION PLAN AUDIT ==========");
  console.log("Users scanned:    ", audit.usersScanned);
  console.log("Subscribers:      ", audit.subscribers);
  console.log("Basic:            ", audit.basic);
  console.log("Super:            ", audit.super);
  console.log("Unlimited:        ", audit.unlimited);
  console.log("Campaign:         ", audit.campaign);
  console.log("Mismatches:       ", audit.mismatches);
  console.log("Corrected:        ", audit.corrected || result.corrected || 0);
  console.log("Manual Review:    ", audit.manualReview);

  if (audit.mismatchDetails?.length) {
    console.log("\nMismatches:");
    for (const m of audit.mismatchDetails) {
      console.log(
        `  ${m.email || m.userId} | mongo=${m.mongoPlanName} → auth=${m.authoritativePlanName} [${m.evidenceSource}]`
      );
      if (m.creditDrift?.length) {
        for (const d of m.creditDrift) {
          console.log(`    credit drift ${d.layer}: ${d.value} (expected ${d.expected})`);
        }
      }
    }
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  process.exit(audit.mismatches > 0 && !args.repair ? 1 : 0);
}

run().catch(async (err) => {
  console.error("[auditProductionPlans] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
