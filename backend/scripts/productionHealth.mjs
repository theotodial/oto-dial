#!/usr/bin/env node
/**
 * RC2 Priority 7 — Official production health gate.
 *
 *   npm run production:health
 *   node scripts/productionHealth.mjs [--json] [--limit=200]
 *
 * Exit codes:
 *   0 — PASS or PASS_WITH_WARNINGS (no critical category failures)
 *   1 — FAIL (one or more categories in FAIL state)
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { parseCliArgs, resolveHealthOutcome } from "../src/services/production/productionAuditCommon.js";
import { runProductionHealth } from "../src/services/production/productionHealthService.js";

const args = parseCliArgs();

async function run() {
  process.env.TELECOM_BILLING_TRACE = "0";
  await connectDB();
  const report = await runProductionHealth({
    snapshotName: args.snapshotName,
    limit: args.limit || 100,
    print: !args.json,
  });

  const { outcome, exitCode } = resolveHealthOutcome(report.categories);
  report.healthOutcome = outcome;
  report.exitCode = exitCode;

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  await mongoose.disconnect();
  process.exit(exitCode);
}

run().catch(async (err) => {
  console.error("[productionHealth] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
