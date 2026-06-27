#!/usr/bin/env node
/**
 * RC2.1 — Root cause analysis (read-only). Writes RC2_FAILURE_ANALYSIS.md
 *
 *   node scripts/analyzeProductionFailures.mjs
 */

import "../loadEnv.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { runFullFailureAnalysis } from "../src/services/production/productionFailureAnalysisService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, "..", "RC2_FAILURE_ANALYSIS.md");

function mdTable(headers, rows) {
  const h = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return [h, sep, body].filter(Boolean).join("\n");
}

function buildMarkdown(analysis) {
  const lines = [];
  lines.push("# OTODIAL RC2.1 — Production Failure Root Cause Analysis");
  lines.push("");
  lines.push(`**Generated:** ${analysis.ranAt}`);
  lines.push("");
  lines.push("> Read-only analysis. No repairs executed.");
  lines.push("");

  lines.push("## Health Summary");
  lines.push("");
  lines.push("### PASS");
  lines.push(analysis.healthContext.passCategories.map((c) => `- ${c}`).join("\n"));
  lines.push("");
  lines.push("### FAIL");
  lines.push(analysis.healthContext.failCategories.map((c) => `- ${c}`).join("\n"));
  lines.push("");
  lines.push(`**Subscribers scanned:** ${analysis.totals.subscribersScanned}`);
  lines.push("");

  // Credits
  lines.push("## Priority 1 — Credits Failure Analysis");
  lines.push("");
  lines.push(`**Failed users:** ${analysis.credits.failed} / ${analysis.credits.totalScanned}`);
  lines.push("");
  if (analysis.credits.byRootCause && Object.keys(analysis.credits.byRootCause).length) {
    lines.push("### Root cause distribution");
    for (const [k, v] of Object.entries(analysis.credits.byRootCause)) {
      lines.push(`- **${k}:** ${v} users`);
    }
    lines.push("");
  }
  if (analysis.credits.rows.length) {
    lines.push("### Per-user table");
    lines.push("");
    lines.push(
      mdTable(
        ["User", "Ledger", "Subscription", "User Cache", "Wallet API", "Dashboard", "Diff", "Root Cause", "Repair?"],
        analysis.credits.rows.slice(0, 100).map((r) => [
          r.user || r.userId,
          String(r.ledgerBalance),
          String(r.subscription),
          String(r.userCache),
          String(r.walletApi),
          String(r.dashboard),
          String(r.difference),
          r.rootCause,
          r.repairRequired ? "Yes" : "No",
        ])
      )
    );
    if (analysis.credits.rows.length > 100) {
      lines.push(`\n*…and ${analysis.credits.rows.length - 100} more*`);
    }
  } else {
    lines.push("*No credit failures detected in full scan.*");
  }
  lines.push("");

  // Plans
  lines.push("## Priority 2 — Plans Failure Analysis");
  lines.push("");
  lines.push(`**Failed plan records:** ${analysis.plans.failed} / ${analysis.plans.totalScanned} subscribers`);
  lines.push(`**Fleet:** Basic=${analysis.plans.counts?.basic ?? "?"}, Super=${analysis.plans.counts?.super ?? "?"}, Unlimited=${analysis.plans.counts?.unlimited ?? "?"}, Campaign=${analysis.plans.counts?.campaign ?? "?"}`);
  lines.push("");
  if (analysis.plans.byRootCause) {
    lines.push("### Root cause distribution");
    for (const [k, v] of Object.entries(analysis.plans.byRootCause)) {
      lines.push(`- **${k}:** ${v}`);
    }
    lines.push("");
  }
  for (const r of analysis.plans.rows.slice(0, 50)) {
    lines.push(`### ${r.email || r.userId}`);
    lines.push(`- **Current plan:** ${r.currentPlan || r.mongoPlanName}`);
    lines.push(`- **Expected plan:** ${r.expectedPlan || r.authoritativePlanName}`);
    lines.push(`- **Root cause:** ${r.rootCause}`);
    lines.push(`- **Why:** ${r.why || "—"}`);
    lines.push(`- **Stripe price:** ${r.stripePriceId || "—"} (${r.stripeCanonical || "—"})`);
    lines.push(`- **Migration issue:** ${r.migrationIssue ? "Yes" : "No"}`);
    lines.push(`- **Metadata issue:** ${r.metadataIssue ? "Yes" : "No"}`);
    lines.push(`- **Stripe issue:** ${r.stripeIssue ? "Yes" : "No"}`);
    lines.push(`- **Repair required:** ${r.repairRequired ? "Yes" : "No"} | **Risk:** ${r.risk}`);
    lines.push(`- **Recommendation:** ${r.repair || r.recommendedRepair || "—"}`);
    lines.push("");
  }

  // Analytics
  lines.push("## Priority 3 — Analytics Failure Analysis");
  lines.push("");
  lines.push(`**Failed records:** ${analysis.analytics.failed} / ${analysis.analytics.totalScanned}`);
  lines.push("");
  if (analysis.analytics.byRootCause) {
    lines.push("### Root cause distribution");
    for (const [k, v] of Object.entries(analysis.analytics.byRootCause)) {
      lines.push(`- **${k}:** ${v}`);
    }
    lines.push("");
  }
  if (analysis.analytics.byEndpoint) {
    lines.push("### Affected API endpoints");
    for (const [ep, count] of Object.entries(analysis.analytics.byEndpoint)) {
      lines.push(`- ${ep}: ${count} users`);
    }
    lines.push("");
  }
  for (const r of analysis.analytics.rows.slice(0, 30)) {
    lines.push(`- **${r.userId}** [${r.status}]: ${r.rootCause} — pipeline: ${r.pipeline || "—"}`);
  }
  lines.push("");
  lines.push("Analytics does not compute balances independently; failures propagate from Subscription/User cache drift via `loadUserSubscription` and `getLatestSubscriptionCreditSnapshot`.");
  lines.push("");

  // Migration
  lines.push("## Priority 4 — Migration Failure Analysis");
  lines.push("");
  lines.push(`**Verification OK:** ${analysis.migration.ok}`);
  lines.push(`**Failures:** ${analysis.migration.failureCount} | **Warnings:** ${analysis.migration.warningCount}`);
  lines.push(`**Migration reset ledger:** ${analysis.migration.migrationReset?.hasReset} have reset / ${analysis.migration.migrationReset?.missingReset} missing (of ${analysis.migration.migrationReset?.activeSubs} active subs)`);
  lines.push("");
  lines.push("### Failure categories");
  for (const [cat, data] of Object.entries(analysis.migration.categories || {})) {
    if (data.count > 0) {
      lines.push(`\n#### ${cat} (${data.count})`);
      for (const item of data.items || []) {
        lines.push(`- ${item}`);
      }
    }
  }
  lines.push("");

  // Repair preview
  lines.push("## Priority 5 — Repair Preview (NOT EXECUTED)");
  lines.push("");
  for (const p of analysis.repairPreview) {
    lines.push(`### ${p.category} — ${p.affectedUsers ?? p.affectedRecords ?? "?"} records`);
    lines.push(`- **Root cause:** ${p.rootCause}`);
    lines.push(`- **Reason:** ${p.reason}`);
    lines.push(`- **Repair:** ${p.repair}`);
    lines.push(`- **Risk:** ${p.risk}`);
    lines.push(`- **Safe to auto-repair:** ${p.safe ? "Yes" : "No — review first"}`);
    lines.push("");
  }

  lines.push("## Risk Assessment");
  lines.push("");
  lines.push("| Category | Auto-repair safe? | Notes |");
  lines.push("| --- | --- | --- |");
  lines.push("| User cache sync | Yes (low risk) | Mirror Subscription → User only |");
  lines.push("| Ledger → Subscription | Medium | Only when ledger is authoritative and chain valid |");
  lines.push("| Plan mapping | Medium | Requires Stripe price evidence per user |");
  lines.push("| Analytics | Yes (after credits) | Downstream of authority fix |");
  lines.push("| Migration | Varies | Duplicate subs / negative balances need manual review |");
  lines.push("");
  lines.push("## Next Steps");
  lines.push("");
  lines.push("1. Review this report");
  lines.push("2. `npm run audit:billing-authority` (dry-run)");
  lines.push("3. `npm run audit:production-plans` (dry-run)");
  lines.push("4. Only then: `--repair` on proven cases");
  lines.push("");

  return lines.join("\n");
}

async function run() {
  process.env.TELECOM_BILLING_TRACE = "0";
  await connectDB();
  console.log("[analyzeProductionFailures] Running full RCA (read-only)…\n");

  const analysis = await runFullFailureAnalysis();
  const markdown = buildMarkdown(analysis);
  fs.writeFileSync(REPORT_PATH, markdown, "utf8");

  console.log("========== RC2.1 RCA SUMMARY ==========");
  console.log("Credits failures:   ", analysis.totals.creditFailures);
  console.log("Plan failures:      ", analysis.totals.planFailures);
  console.log("Analytics failures: ", analysis.totals.analyticsFailures);
  console.log("Migration failures: ", analysis.totals.migrationFailures);
  console.log("\nCredits by root cause:", analysis.credits.byRootCause);
  console.log("Plans by root cause:  ", analysis.plans.byRootCause);
  console.log("Analytics by root cause:", analysis.analytics.byRootCause);
  console.log(`\nReport written: ${REPORT_PATH}`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error("[analyzeProductionFailures] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
