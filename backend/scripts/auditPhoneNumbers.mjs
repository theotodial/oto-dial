#!/usr/bin/env node
/**
 * RC2 Priority 3 — Purchased number ownership audit (read-only, manual review queue).
 *
 *   node scripts/auditPhoneNumbers.mjs
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { parseCliArgs } from "../src/services/production/productionAuditCommon.js";
import { auditPhoneNumberOwnership } from "../src/services/production/productionPhoneNumberAuditService.js";

const args = parseCliArgs();

async function run() {
  await connectDB();
  const result = await auditPhoneNumberOwnership();

  console.log("\n========== PHONE NUMBER OWNERSHIP AUDIT ==========");
  console.log("Total Numbers:         ", result.totalNumbers);
  console.log("Assigned:              ", result.assigned);
  console.log("Orphans:               ", result.orphans);
  console.log("Duplicates:            ", result.duplicates);
  console.log("Inactive Assigned:     ", result.inactiveAssigned);
  console.log("Telnyx Checked:        ", result.telnyxInventoryChecked);
  console.log("Telnyx Inventory:      ", result.telnyxInventoryCount);
  console.log("Recovered:             ", result.recovered);
  console.log("Manual Review Required:", result.manualReviewRequired);
  console.log("Status:                ", result.status);

  if (result.manualReview.length) {
    console.log("\n--- MANUAL REVIEW QUEUE ---");
    for (const item of result.manualReview.slice(0, 50)) {
      console.log(`  ${item.phoneNumber} | ${(item.issues || []).join(", ")} | user=${item.userId || "—"}`);
    }
    if (result.manualReview.length > 50) {
      console.log(`  ... and ${result.manualReview.length - 50} more`);
    }
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  process.exit(result.status === "FAIL" ? 1 : 0);
}

run().catch(async (err) => {
  console.error("[auditPhoneNumbers] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
