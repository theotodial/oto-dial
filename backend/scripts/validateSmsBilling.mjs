#!/usr/bin/env node
/**
 * RC2 Priority 6 — SMS billing validation matrix.
 *
 *   node scripts/validateSmsBilling.mjs
 */

import "../loadEnv.js";
import { buildSmsBillingMatrix } from "../src/services/production/productionSmsBillingValidation.js";

const result = buildSmsBillingMatrix();

console.log("\n========== SMS BILLING VALIDATION ==========\n");
console.log("Status:", result.status);
for (const c of result.checks) {
  console.log(`  ${c.pass ? "✓" : "✗"} ${c.id} (expected=${c.expected}, actual=${c.actual})`);
}
console.log("\nScenarios:");
for (const s of result.scenarios) {
  console.log(`  ${s.id.padEnd(22)} ${s.encoding} x${s.segments} → ${s.expectedCredits} credits`);
}

process.exit(result.status === "PASS" ? 0 : 1);
