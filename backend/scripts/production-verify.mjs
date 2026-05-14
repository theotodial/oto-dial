/**
 * Production verification harness: tests + env + DB connectivity + readiness summary.
 * Run from repo root: npm run production:verify
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

function loadDotenvFiles() {
  const candidates = [path.join(backendRoot, ".env"), path.join(backendRoot, "..", ".env")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      const k = m[1];
      if (process.env[k] == null || String(process.env[k]).trim() === "") {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[k] = v;
      }
    }
  }
}

async function main() {
  console.log("=== OTODIAL production:verify ===\n");
  loadDotenvFiles();

  const test = spawnSync(process.execPath, ["--test", "--test-timeout=60000"], {
    cwd: backendRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (test.status !== 0) {
    console.error("\n[production:verify] backend tests failed.");
    process.exit(test.status || 1);
  }

  const required = ["MONGODB_URI", "JWT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TELNYX_API_KEY"];
  const envIssues = [];
  for (const k of required) {
    if (!String(process.env[k] || "").trim()) envIssues.push(`missing ${k}`);
  }
  if (!String(process.env.REDIS_URL || "").trim()) {
    console.warn("[production:verify] REDIS_URL not set — distributed dedup uses in-memory fallback.");
  }
  console.log("\n[ENV]", envIssues.length ? envIssues.join(", ") : "required keys present (see validateEnv at boot for full list).");

  const mongoose = (await import("mongoose")).default;
  const uri = String(process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error("[production:verify] MONGODB_URI missing — cannot run readiness.");
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 });
  console.log("[MongoDB] connected for verification.");

  const { getRedisClient } = await import("../src/services/cache.service.js");
  const redis = await getRedisClient();
  if (redis?.isOpen) {
    await redis.ping();
    console.log("[Redis] ping ok.");
  } else {
    console.warn("[Redis] unavailable or REDIS_URL unset.");
  }

  const { runProductionReadinessChecks } = await import("../src/services/productionReadinessService.js");
  const readiness = await runProductionReadinessChecks({ fullIndexAudit: true, silent: true });

  const { default: Plan } = await import("../src/models/Plan.js");
  const { default: AddonPlan } = await import("../src/models/AddonPlan.js");
  const [activePlans, plansMissingStripe, activeAddons, addonsMissingStripe] = await Promise.all([
    Plan.countDocuments({ active: true }),
    Plan.countDocuments({
      active: true,
      $or: [{ stripePriceId: { $in: [null, ""] } }, { stripeProductId: { $in: [null, ""] } }],
    }),
    AddonPlan.countDocuments({ active: true }),
    AddonPlan.countDocuments({ active: true, stripePriceId: { $in: [null, ""] } }),
  ]);

  console.log("\n[STRIPE CATALOG]", { activePlans, plansMissingStripe, activeAddons, addonsMissingStripe });

  console.log("\n[READINESS]", {
    overall: readiness.overall,
    deploymentMode: readiness.deploymentMode,
    sections: {
      database: readiness.sections.database.status,
      billing: readiness.sections.billing.status,
      stripe: readiness.sections.stripe.status,
      telnyx: readiness.sections.telnyx.status,
      agents: readiness.sections.agents.status,
    },
  });

  console.log("\n=== LAUNCH SUMMARY ===");
  console.log(
    JSON.stringify(
      { tests: "ok", readiness: readiness.overall, stripeCatalogGaps: { plansMissingStripe, addonsMissingStripe } },
      null,
      2
    )
  );

  await mongoose.disconnect().catch(() => {});
  try {
    if (redis?.isOpen) await redis.quit();
  } catch {
    /* ignore */
  }

  if (readiness.overall === "critical") {
    console.error("\n[production:verify] Readiness CRITICAL — resolve before live traffic.");
    process.exit(2);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
