#!/usr/bin/env node
/**
 * RC2 Priority 5 — Analytics credit verification (ledger-sourced).
 *
 *   node scripts/auditAnalyticsCredits.mjs [--user <id>]
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { parseCliArgs } from "../src/services/production/productionAuditCommon.js";
import { auditAnalyticsCredits } from "../src/services/production/productionAnalyticsAuditService.js";

const args = parseCliArgs();

async function run() {
  await connectDB();
  const result = await auditAnalyticsCredits({ userId: args.userId, limit: args.limit });

  console.log("\n========== ANALYTICS CREDIT AUDIT ==========");
  console.log("Status:              ", result.status);
  console.log("Scanned:             ", result.scanned);
  console.log("PASS / WARN / FAIL:  ", `${result.pass} / ${result.warn} / ${result.fail}`);
  console.log("Global credits granted:", result.globalLedger.creditsGranted);
  console.log("Global credits used:   ", result.globalLedger.creditsUsed);

  for (const m of result.mismatches.slice(0, 30)) {
    console.log(`\n  ${m.userId} [${m.status}]`);
    for (const mm of m.mismatches) {
      console.log(`    ${mm.field}:`, JSON.stringify(mm));
    }
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  process.exit(result.status === "FAIL" ? 1 : 0);
}

run().catch(async (err) => {
  console.error("[auditAnalyticsCredits] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
