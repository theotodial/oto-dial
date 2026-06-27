#!/usr/bin/env node
/**
 * RC2 Priority 4 — Billing authority reconciliation.
 *
 *   node scripts/auditBillingAuthority.mjs [--repair] [--user <id>]
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { parseCliArgs } from "../src/services/production/productionAuditCommon.js";
import {
  auditBillingAuthority,
  repairBillingAuthority,
} from "../src/services/production/productionBillingAuthorityService.js";

const args = parseCliArgs();

async function run() {
  await connectDB();
  const options = { userId: args.userId, limit: args.limit, dryRun: args.dryRun };

  const result = args.repair
    ? await repairBillingAuthority(options)
    : { audit: await auditBillingAuthority(options) };

  const audit = result.audit;
  console.log("\n========== BILLING AUTHORITY AUDIT ==========");
  console.log("Scanned:", audit.scanned);
  console.log("PASS:   ", audit.pass);
  console.log("WARN:   ", audit.warn);
  console.log("FAIL:   ", audit.fail);

  for (const row of audit.failures || []) {
    console.log(`\nFAIL ${row.email || row.userId}`);
    for (const f of row.failures) {
      console.log(`  [${f.severity}] ${f.code}: ${f.reason}`);
    }
    console.log("  Layers:", JSON.stringify(row.layers));
  }

  if (result.repaired?.length) {
    console.log("\nRepaired:", result.repaired.length);
    result.repaired.forEach((r) => console.log(`  ${r.userId}: ${r.action}`));
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  process.exit(audit.fail > 0 && !args.repair ? 1 : 0);
}

run().catch(async (err) => {
  console.error("[auditBillingAuthority] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
