/**
 * RC2 Priority 7 — official production health gate.
 * Orchestrates all production audits without redesigning billing systems.
 */

import mongoose from "mongoose";
import CreditLedger from "../../models/CreditLedger.js";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import EconomicTimeline from "../../models/EconomicTimeline.js";
import Call from "../../models/Call.js";
import { runProductionReadinessChecks } from "../productionReadinessService.js";
import { runMigrationVerification } from "../migration/migrationVerifyService.js";
import { categoryStatus, printHealthSummary } from "./productionAuditCommon.js";
import { auditProductionPlans } from "./productionPlanAuditService.js";
import { auditBillingAuthority } from "./productionBillingAuthorityService.js";
import { auditPhoneNumberOwnership } from "./productionPhoneNumberAuditService.js";
import { auditAnalyticsCredits } from "./productionAnalyticsAuditService.js";
import {
  buildVoiceScenarioMatrix,
  validateRatingEngineConsistency,
} from "./productionBillingMatrixValidation.js";
import { buildSmsBillingMatrix } from "./productionSmsBillingValidation.js";
import { isRatingV1Enabled, getRatingTableSnapshot } from "../telecomRatingEngine.js";

const TERMINAL = ["completed", "failed", "rejected", "canceled", "busy", "no-answer"];

async function auditBillingCategory() {
  const checks = [];
  const rating = validateRatingEngineConsistency();
  checks.push({
    id: "rating_engine",
    pass: rating.status === "PASS",
    severity: "critical",
    detail: `Rating engine ${rating.pass}/${rating.checks.length} checks`,
  });
  checks.push({
    id: "rating_v1_enabled",
    pass: isRatingV1Enabled(),
    severity: "critical",
    detail: isRatingV1Enabled() ? "TELECOM_RATING_V1 active" : "TELECOM_RATING_V1 disabled",
  });
  const matrix = buildVoiceScenarioMatrix();
  checks.push({
    id: "voice_matrix_defined",
    pass: matrix.scenarios.length >= 14,
    severity: "info",
    detail: `${matrix.scenarios.length} voice scenarios defined`,
  });
  const sms = buildSmsBillingMatrix();
  checks.push({
    id: "sms_matrix",
    pass: sms.status === "PASS",
    severity: "critical",
    detail: `SMS matrix ${sms.pass}/${sms.checks.length}`,
  });
  return { ...categoryStatus(checks), matrix, sms, rating };
}

async function auditCreditsCategory(opts) {
  const authority = await auditBillingAuthority({ limit: opts.limit || 200 });
  const chainGapWarns = authority.results.filter((r) =>
    r.failures?.some((f) => f.code === "ledger_chain_historical_gap")
  ).length;
  const checks = [
    {
      id: "billing_authority_critical",
      pass: authority.fail === 0,
      severity: "critical",
      detail: `PASS ${authority.pass} / WARN ${authority.warn} / FAIL ${authority.fail}`,
    },
    {
      id: "ledger_chain_historical_gap",
      pass: chainGapWarns === 0,
      severity: "warning",
      detail: `${chainGapWarns} subscriber(s) with historical ledger chain gaps (tail balances aligned)`,
    },
  ];
  const negativeUsers = await User.countDocuments({ remainingCredits: { $lt: 0 } });
  const negativeSubs = await Subscription.countDocuments({ remainingCredits: { $lt: 0 } });
  checks.push({ id: "negative_users", pass: negativeUsers === 0, severity: "critical", detail: `${negativeUsers} negative users` });
  checks.push({ id: "negative_subs", pass: negativeSubs === 0, severity: "critical", detail: `${negativeSubs} negative subs` });
  return { ...categoryStatus(checks), authority };
}

async function auditPlansCategory(opts) {
  const plans = await auditProductionPlans({ snapshotName: opts.snapshotName, limit: opts.limit });
  const checks = [
    {
      id: "plan_mismatches",
      pass: plans.mismatches === 0,
      severity: plans.mismatches > 0 ? "critical" : "info",
      detail: `${plans.mismatches} mismatches / ${plans.manualReview} manual review`,
    },
  ];
  return { ...categoryStatus(checks), plans };
}

async function auditNumbersCategory() {
  const numbers = await auditPhoneNumberOwnership();
  const checks = [
    {
      id: "number_ownership",
      pass: numbers.status === "PASS",
      severity: numbers.status === "FAIL" ? "critical" : numbers.status === "WARN" ? "warning" : "info",
      detail: `assigned=${numbers.assigned} orphans=${numbers.orphans} dup=${numbers.duplicates} manual=${numbers.manualReviewRequired}`,
    },
  ];
  return { ...categoryStatus(checks), numbers };
}

async function auditStripeCategory() {
  const checks = [];
  const missingPrice = await Subscription.countDocuments({
    status: { $in: ["active", "past_due"] },
    stripeSubscriptionId: { $ne: null },
    $or: [{ stripePriceId: null }, { stripePriceId: "" }],
  });
  checks.push({
    id: "active_subs_missing_price",
    pass: missingPrice === 0,
    severity: "warning",
    detail: `${missingPrice} active Stripe subs missing stripePriceId in Mongo`,
  });
  const dupActive = await Subscription.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: "$userId", c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
    { $count: "n" },
  ]);
  const dupCount = dupActive[0]?.n || 0;
  checks.push({
    id: "duplicate_active_subs",
    pass: dupCount === 0,
    severity: "critical",
    detail: `${dupCount} users with duplicate active subscriptions`,
  });
  return categoryStatus(checks);
}

async function auditLedgerCategory() {
  const checks = [];
  const dupKeys = await CreditLedger.aggregate([
    { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  checks.push({
    id: "duplicate_idempotency",
    pass: dupKeys.length === 0,
    severity: "critical",
    detail: dupKeys.length ? `${dupKeys.length}+ duplicate keys` : "No duplicate idempotency keys",
  });
  return categoryStatus(checks);
}

async function auditAnalyticsCategory(opts) {
  const analytics = await auditAnalyticsCredits({ limit: opts.limit || 100 });
  const checks = [
    {
      id: "analytics_ledger_alignment",
      pass: analytics.status === "PASS",
      severity: analytics.status === "FAIL" ? "critical" : analytics.status === "WARN" ? "warning" : "info",
      detail: `PASS ${analytics.pass} / WARN ${analytics.warn} / FAIL ${analytics.fail}`,
    },
  ];
  return { ...categoryStatus(checks), analytics };
}

async function auditReservationsCategory() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const hanging = await Call.countDocuments({
    direction: "outbound",
    status: { $in: TERMINAL },
    creditReservationHeld: { $gt: 0 },
    creditReservationReleasedAt: null,
    updatedAt: { $gte: since },
  });
  const openTimelines = await EconomicTimeline.countDocuments({ finalizedAt: null, reservedCredits: { $gt: 0 } });
  const checks = [
    {
      id: "hanging_reservations",
      pass: hanging === 0,
      severity: hanging > 0 ? "critical" : "info",
      detail: `${hanging} terminal calls with unreleased reservations (7d)`,
    },
    {
      id: "open_timeline_reserved",
      pass: true,
      severity: "info",
      detail: `${openTimelines} open timelines with reserved credits (may be active calls)`,
    },
  ];
  return categoryStatus(checks);
}

async function auditMigrationCategory(opts) {
  const verification = await runMigrationVerification({
    snapshotName: opts.snapshotName,
    strictGrants: false,
  });
  const baseline = verification.summary?.phoneNumbers?.baseline;
  const now = verification.summary?.phoneNumbers?.now;
  const assignedDrop =
    baseline && now && Number(now.assigned) < Number(baseline.assigned);
  const phoneWarning = verification.warnings.find((w) => w.includes("[manual review]"));

  const checks = [
    {
      id: "migration_credit_integrity",
      pass: verification.ok,
      severity: "critical",
      detail: verification.ok
        ? `Migration OK (${verification.summary.migratedCount} migrated)`
        : `${verification.failures.length} critical failure(s)`,
    },
    {
      id: "phone_baseline_manual_review",
      pass: !assignedDrop,
      severity: "warning",
      detail: assignedDrop
        ? phoneWarning ||
          `Assigned phones baseline ${baseline.assigned} → ${now.assigned} (historical; manual review)`
        : "Phone baseline unchanged",
    },
  ];
  return { ...categoryStatus(checks), verification };
}

export async function runProductionHealth(options = {}) {
  const opts = {
    snapshotName: options.snapshotName || "telecom-credit-migration-v1",
    limit: options.limit || 200,
    print: options.print !== false,
  };

  const mongoOk = mongoose.connection.readyState === 1;
  let infra = { status: "PASS", checks: [] };
  if (mongoOk) {
    try {
      const readiness = await runProductionReadinessChecks({ fullIndexAudit: false });
      infra = {
        status: readiness.overall === "critical" ? "FAIL" : readiness.overall === "warning" ? "WARN" : "PASS",
        readiness,
      };
    } catch (err) {
      infra = { status: "FAIL", error: err?.message || String(err) };
    }
  } else {
    infra = { status: "FAIL", error: "mongo_not_connected" };
  }

  const [billing, credits, plans, numbers, stripe, ledger, analytics, reservations, migration] =
    await Promise.all([
      auditBillingCategory(),
      mongoOk ? auditCreditsCategory(opts) : { status: "FAIL", error: "mongo_not_connected" },
      mongoOk ? auditPlansCategory(opts) : { status: "FAIL", error: "mongo_not_connected" },
      mongoOk ? auditNumbersCategory() : { status: "FAIL", error: "mongo_not_connected" },
      mongoOk ? auditStripeCategory() : { status: "FAIL", error: "mongo_not_connected" },
      mongoOk ? auditLedgerCategory() : { status: "FAIL", error: "mongo_not_connected" },
      mongoOk ? auditAnalyticsCategory(opts) : { status: "FAIL", error: "mongo_not_connected" },
      mongoOk ? auditReservationsCategory() : { status: "FAIL", error: "mongo_not_connected" },
      mongoOk ? auditMigrationCategory(opts) : { status: "FAIL", error: "mongo_not_connected" },
    ]);

  const categories = {
    Billing: billing,
    Credits: credits,
    Plans: plans,
    Numbers: numbers,
    Stripe: stripe,
    Ledger: ledger,
    Analytics: analytics,
    Reservations: reservations,
    Migration: migration,
    Infrastructure: infra,
  };

  const summary = opts.print ? printHealthSummary(categories) : null;

  return {
    ranAt: new Date().toISOString(),
    ratingTable: getRatingTableSnapshot(),
    categories,
    summary,
    mongoConnected: mongoOk,
  };
}
