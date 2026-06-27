#!/usr/bin/env node
/**
 * RC2 Priority 2 — Billing validation matrix (rating-engine expected values).
 * Runs pure rating checks + optional live Mongo matrix (spawn).
 *
 *   node scripts/validateBillingMatrix.mjs [--live]
 */

import "../loadEnv.js";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildVoiceScenarioMatrix,
  validateRatingEngineConsistency,
} from "../src/services/production/productionBillingMatrixValidation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes("--live");

console.log("\n========== BILLING VALIDATION MATRIX ==========\n");

const rating = validateRatingEngineConsistency();
console.log("Rating engine consistency:", rating.status, `(${rating.pass}/${rating.checks.length})`);
for (const c of rating.checks) {
  console.log(`  ${c.pass ? "✓" : "✗"} ${c.id}`);
}

const matrix = buildVoiceScenarioMatrix();
console.log(`\nVoice scenarios (${matrix.ratingV1Enabled ? "v1" : "legacy"}):`);
for (const s of matrix.scenarios) {
  console.log(`  ${s.id.padEnd(28)} expected=${s.expectedCredits} credits`);
}

let liveOk = true;
if (live) {
  console.log("\n--- Live Mongo billing matrix (A–J) ---");
  const r = spawnSync("node", ["scripts/runLocalBillingMatrix.js"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    stdio: "pipe",
  });
  if (r.stdout) console.log(r.stdout.slice(-2000));
  if (r.stderr) console.error(r.stderr.slice(-1000));
  liveOk = r.status === 0;
  console.log("Live matrix:", liveOk ? "PASS" : "FAIL");
}

const ok = rating.status === "PASS" && (!live || liveOk);
process.exit(ok ? 0 : 1);
