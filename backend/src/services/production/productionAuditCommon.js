/**
 * Shared helpers for RC2 production audit scripts.
 */

export function parseCliArgs(argv = process.argv.slice(2)) {
  const userIdx = argv.indexOf("--user");
  const snapshotIdx = argv.indexOf("--snapshot");
  return {
    dryRun: !argv.includes("--repair") && !argv.includes("--apply"),
    repair: argv.includes("--repair") || argv.includes("--apply"),
    userId: userIdx >= 0 ? argv[userIdx + 1] : null,
    snapshotName: snapshotIdx >= 0 ? argv[snapshotIdx + 1] : "telecom-credit-migration-v1",
    json: argv.includes("--json"),
    limit: Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0) || null,
  };
}

/** Normalize plan family labels for audit comparison (Stripe vs Mongo naming). */
export function normalizePlanFamilyKey(key) {
  const k = String(key || "").trim().toLowerCase();
  if (k === "campaign" || k === "sms_campaign" || k === "sms campaign") return "sms_campaign";
  return k || "unknown";
}

export function categoryStatus(checks) {
  const critical = checks.filter((c) => !c.pass && c.severity === "critical");
  if (critical.length) return { status: "FAIL", failed: critical.length, checks };
  const warnings = checks.filter((c) => !c.pass && c.severity === "warning");
  if (warnings.length) return { status: "WARN", failed: warnings.length, checks };
  return { status: "PASS", failed: 0, checks };
}

export function resolveHealthOutcome(categories) {
  const statuses = Object.values(categories).map((c) => c.status || "PASS");
  if (statuses.some((s) => s === "FAIL")) {
    return { outcome: "FAIL", exitCode: 1 };
  }
  if (statuses.some((s) => s === "WARN")) {
    return { outcome: "PASS_WITH_WARNINGS", exitCode: 0 };
  }
  return { outcome: "PASS", exitCode: 0 };
}

export function printBanner(title) {
  console.log("\n=================================");
  console.log(title);
  console.log("=================================\n");
}

export function printHealthSummary(categories) {
  printBanner("OTODIAL PRODUCTION HEALTH");
  const entries = Object.entries(categories);
  let passCount = 0;
  for (const [name, cat] of entries) {
    const label = (cat.status || "PASS").padEnd(6);
    console.log(`${name.padEnd(14)} ${label}`);
    if (cat.status === "PASS") passCount += 1;
  }
  const { outcome, exitCode } = resolveHealthOutcome(categories);
  const pct = entries.length ? Math.round((passCount / entries.length) * 100) : 0;
  const overall =
    outcome === "PASS"
      ? "READY FOR DEPLOYMENT"
      : outcome === "PASS_WITH_WARNINGS"
        ? "READY WITH WARNINGS"
        : "NOT READY — FAILURES PRESENT";
  console.log(`\nOverall        ${pct}%`);
  console.log(`Outcome        ${outcome} (exit ${exitCode})`);
  console.log(overall);
  console.log("=================================\n");
  return { pct, overall, outcome, exitCode, passCount, total: entries.length };
}

export function summarizeCounts(rows, field = "family") {
  const counts = { basic: 0, super: 0, unlimited: 0, campaign: 0, unknown: 0 };
  for (const row of rows) {
    const key = String(row[field] || "unknown").toLowerCase();
    if (key.includes("basic")) counts.basic += 1;
    else if (key.includes("super")) counts.super += 1;
    else if (key.includes("unlimited")) counts.unlimited += 1;
    else if (key.includes("sms") || key.includes("campaign")) counts.campaign += 1;
    else counts.unknown += 1;
  }
  return counts;
}
