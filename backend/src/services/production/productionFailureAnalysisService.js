/**
 * RC2.1 — Read-only root cause analysis for production health failures.
 * Does NOT repair. Produces structured evidence for RC2_FAILURE_ANALYSIS.md
 */

import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import CreditLedger from "../../models/CreditLedger.js";
import Plan from "../../models/Plan.js";
import { rebuildBalanceFromCreditLedger, balancesRoughlyEqual } from "../ledgerReconstructionService.js";
import { auditBillingAuthorityForUser } from "./productionBillingAuthorityService.js";
import { auditProductionPlans } from "./productionPlanAuditService.js";
import { auditAnalyticsCreditsForUser } from "./productionAnalyticsAuditService.js";
import { runMigrationVerification } from "../migration/migrationVerifyService.js";
import { getLatestSubscriptionCreditSnapshot } from "../creditLedgerService.js";
import { computeProjectedUserBalance } from "../projectedBalanceService.js";
import { loadUserSubscription } from "../subscriptionService.js";
import { resolveAuthoritativePlanForSubscription } from "../migration/migrationPlanResolver.js";
import { resolvePlanCreditGrant } from "../migration/migrationCreditGrant.js";
import { getCanonicalPlanKeyFromPriceId } from "../../config/stripeCatalog.js";
import { getStripe } from "../../../config/stripe.js";

function classifyCreditRootCause(row) {
  const failures = row.failures || [];
  const codes = failures.map((f) => f.code);
  if (codes.includes("user_cache_mismatch")) {
    return {
      rootCause: "user_cache_stale",
      detail: `User cache (${row.layers.userCache}) != Subscription (${row.layers.subscription})`,
      repairRequired: true,
      risk: "low",
      repair: "syncUserCacheFromSubscription — mirror only, no ledger mutation",
    };
  }
  if (codes.includes("ledger_subscription_mismatch")) {
    const diff = row.layers.ledgerTail - row.layers.subscription;
    if (row.ledgerRowCount > 0 && Math.abs(diff) > 0.01) {
      return {
        rootCause: "ledger_subscription_drift",
        detail: `Ledger tail (${row.layers.ledgerTail}) != Subscription (${row.layers.subscription}), diff=${diff.toFixed(4)}`,
        repairRequired: true,
        risk: "medium",
        repair: "Align Subscription.remainingCredits to CreditLedger tail (ledger is system of record)",
      };
    }
  }
  if (codes.includes("ledger_chain_historical_gap")) {
    return {
      rootCause: "ledger_chain_historical_gap",
      detail: "Historical balanceBefore/After chain gaps; tail balance matches Subscription/User/Dashboard",
      repairRequired: false,
      risk: "none",
      repair: "NO REPAIR — informational only; tail is authoritative and aligned",
    };
  }
  if (codes.includes("wallet_api_mismatch")) {
    return {
      rootCause: "wallet_api_drift",
      detail: `Wallet API snapshot != Subscription`,
      repairRequired: true,
      risk: "low",
      repair: "Sync subscription then invalidate wallet read path",
    };
  }
  if (codes.includes("dashboard_mismatch")) {
    return {
      rootCause: "dashboard_load_path_drift",
      detail: `loadUserSubscription credits != Subscription.remainingCredits`,
      repairRequired: true,
      risk: "low",
      repair: "Fix upstream cache; dashboard reads subscription via loadUserSubscription",
    };
  }
  if (codes.includes("reserved_cache_mismatch")) {
    return {
      rootCause: "reserved_cache_stale",
      detail: "User.reservedCredits != Subscription.reservedCredits",
      repairRequired: true,
      risk: "low",
      repair: "syncUserCacheFromSubscription + syncSubscriptionReservedFromTimelines",
    };
  }
  if (codes.includes("negative_balance")) {
    return {
      rootCause: "negative_balance",
      detail: "Negative credit balance detected",
      repairRequired: false,
      risk: "high",
      repair: "MANUAL REVIEW — do not auto-repair negative balances",
    };
  }
  return {
    rootCause: codes.join(",") || "unknown",
    detail: failures.map((f) => f.reason).join("; "),
    repairRequired: false,
    risk: "medium",
    repair: "Investigate manually",
  };
}

function classifyPlanRootCause(row) {
  if (row.creditDrift?.length && !row.planMismatch && !row.stripeMongoMismatch) {
    return {
      rootCause: "false_positive_credit_drift_only",
      currentPlan: row.mongoPlanName,
      expectedPlan: row.authoritativePlanName || row.mongoPlanName,
      why: "Plan IDs differ but family/name match; credit cache drift flagged as plan issue",
      migrationIssue: false,
      metadataIssue: false,
      stripeIssue: false,
      repairRequired: false,
      risk: "none",
      repair: "No plan repair; fix credit cache only",
    };
  }
  if (row.planMismatch) {
    const reasons = [];
    if (row.stripeMongoMismatch) reasons.push("stripe_price_vs_mongo_plan_family_mismatch");
    if (row.evidenceSource === "stripe_price_id") reasons.push("stripe_price_authoritative_differs_from_mongo_planId");
    if (!row.stripePriceId) reasons.push("missing_stripe_price_evidence");
    return {
      rootCause: "mongo_planId_not_matching_stripe_price",
      currentPlan: `${row.mongoPlanName} (${row.mongoPlanId})`,
      expectedPlan: `${row.authoritativePlanName} (${row.authoritativePlanId})`,
      why: reasons.join("; ") || "planId mismatch across evidence chain",
      migrationIssue: row.evidenceSource?.includes("snapshot"),
      metadataIssue: row.evidenceSource === "subscription_plan_id",
      stripeIssue: row.evidenceSource === "stripe_price_id",
      repairRequired: true,
      risk: "medium",
      repair: "repairSubscriptionPlanMapping using Stripe price as authority",
    };
  }
  if (row.creditDrift?.length) {
    return {
      rootCause: "credit_cache_drift_not_plan",
      currentPlan: row.mongoPlanName,
      expectedPlan: row.mongoPlanName,
      why: "Plan correct; user cache/dashboard drift",
      repairRequired: false,
      risk: "low",
      repair: "Credit cache sync only",
    };
  }
  return null;
}

function classifyAnalyticsRootCause(row) {
  const mismatches = row.mismatches || [];
  if (!mismatches.length) return null;
  const fields = mismatches.map((m) => m.field);
  if (fields.includes("remainingCredits")) {
    return {
      rootCause: "ledger_subscription_mismatch_propagates_to_dashboard",
      pipeline: "CreditLedger → Subscription (drift) → loadUserSubscription → dashboard.creditsRemaining",
      endpoint: "GET /api/subscription (loadUserSubscription)",
      aggregation: "subscriptionService.loadUserSubscription reads Subscription.remainingCredits + creditSnapshot",
      cache: "User.remainingCredits mirror may be stale",
      legacyField: row.ledger?.rowCount ? null : "no_ledger_rows_user_may_use_legacy",
      repairRequired: true,
      risk: "low",
      repair: "Fix Subscription/Ledger authority first; analytics will follow",
    };
  }
  if (fields.includes("dashboard_remaining")) {
    return {
      rootCause: "dashboard_subscription_read_drift",
      pipeline: "Subscription → loadUserSubscription → creditsRemaining",
      endpoint: "GET /api/subscription",
      aggregation: "getLatestSubscriptionCreditSnapshot + subscription.remainingCredits",
      cache: "Possible stale User cache in parallel reads",
      legacyField: null,
      repairRequired: true,
      risk: "low",
      repair: "Sync subscription/user cache",
    };
  }
  if (fields.includes("totalCreditsUsed")) {
    return {
      rootCause: "subscription_totalCreditsUsed_lags_ledger",
      pipeline: "Subscription.totalCreditsUsed vs sum(ledger debits)",
      endpoint: "N/A — informational",
      aggregation: "subscription.totalCreditsUsed not replayed from ledger",
      cache: null,
      legacyField: "totalCreditsUsed may predate v1 ledger",
      repairRequired: false,
      risk: "low",
      repair: "Optional: recompute totalCreditsUsed from ledger (non-blocking)",
    };
  }
  return { rootCause: "unknown_analytics_drift", mismatches, repairRequired: false, risk: "medium" };
}

function categorizeMigrationFailures(verification) {
  const categories = {
    wrong_credit_grant: [],
    wrong_plan: [],
    missing_migration_reset: [],
    duplicate_migration_reset: [],
    missing_ledger: [],
    wrong_stripe_mapping: [],
    missing_phone_ownership: [],
    legacy_balance_remaining: [],
    unexpected_subscription: [],
    duplicate_active_subscription: [],
    negative_balance: [],
    orphan_plan: [],
    rating_spot_check: [],
    other: [],
  };

  for (const f of verification.failures) {
    const s = String(f);
    if (s.includes("remainingCredits") && s.includes("plan grant")) categories.wrong_credit_grant.push(s);
    else if (s.includes("negative")) categories.negative_balance.push(s);
    else if (s.includes("orphan")) categories.orphan_plan.push(s);
    else if (s.includes("duplicate") && s.includes("active subscriptions")) categories.duplicate_active_subscription.push(s);
    else if (s.includes("Assigned phone numbers dropped")) categories.missing_phone_ownership.push(s);
    else if (s.includes("missing a Stripe price")) categories.wrong_stripe_mapping.push(s);
    else if (s.includes("rateCallEvent") || s.includes("rateConnected") || s.includes("rateSms")) categories.rating_spot_check.push(s);
    else if (s.includes("reservedCredits not zeroed")) categories.wrong_credit_grant.push(s);
    else categories.other.push(s);
  }

  for (const w of verification.warnings) {
    if (String(w).includes("No snapshot baseline")) categories.missing_migration_reset.push(String(w));
    else if (String(w).includes("phone numbers decreased")) categories.missing_phone_ownership.push(String(w));
  }

  return categories;
}

async function fetchStripeContext(subscription) {
  const stripe = getStripe();
  if (!stripe || !subscription?.stripeSubscriptionId) {
    return { available: Boolean(stripe), priceId: subscription?.stripePriceId || null, status: null };
  }
  try {
    const sub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    return {
      available: true,
      priceId: sub?.items?.data?.[0]?.price?.id || null,
      status: sub.status,
      customerId: sub.customer,
    };
  } catch (err) {
    return { available: true, error: err?.message, priceId: subscription.stripePriceId };
  }
}

export async function analyzeCreditsFailures(options = {}) {
  const userIds = options.userIds || (await Subscription.distinct("userId")).map(String);
  const rows = [];
  const byRootCause = new Map();

  for (const uid of userIds) {
    const authority = await auditBillingAuthorityForUser(uid);
    if (authority.status === "PASS") continue;

    const [walletApi, projected, dashboard] = await Promise.all([
      getLatestSubscriptionCreditSnapshot(uid),
      computeProjectedUserBalance(uid),
      loadUserSubscription(uid).catch(() => null),
    ]);

    const ledger = await rebuildBalanceFromCreditLedger(uid);
    const row = {
      user: authority.email || uid,
      userId: uid,
      ledgerBalance: authority.layers.ledgerTail,
      subscription: authority.layers.subscription,
      subscriptionReserved: authority.layers.reservedSubscription,
      userCache: authority.layers.userCache,
      userReserved: authority.layers.reservedUser,
      walletApi: Number(walletApi?.remainingCredits ?? 0),
      projectedAvailable: authority.layers.projectedAvailable,
      dashboard: Number(dashboard?.creditsRemaining ?? dashboard?.remainingCredits ?? 0),
      difference: Number(authority.layers.subscription - authority.layers.userCache),
      ledgerRowCount: ledger.rowCount,
      failures: authority.failures,
      status: authority.status,
    };
    const classified = classifyCreditRootCause({ ...row, layers: authority.layers, ledgerRowCount: ledger.rowCount });
    row.rootCause = classified.rootCause;
    row.rootCauseDetail = classified.detail;
    row.repairRequired = classified.repairRequired;
    row.risk = classified.risk;
    row.recommendedRepair = classified.repair;
    rows.push(row);

    const key = classified.rootCause;
    byRootCause.set(key, (byRootCause.get(key) || 0) + 1);
  }

  return { totalScanned: userIds.length, failed: rows.length, rows, byRootCause: Object.fromEntries(byRootCause) };
}

export async function analyzePlansFailures(options = {}) {
  const audit = await auditProductionPlans({ snapshotName: options.snapshotName });
  const rows = [];
  const byRootCause = new Map();

  for (const row of audit.mismatchDetails || []) {
    const classified = classifyPlanRootCause(row);
    if (!classified) continue;
    const sub = await Subscription.findById(row.subscriptionId).lean();
    const stripe = sub ? await fetchStripeContext(sub) : null;
    const enriched = {
      ...row,
      ...classified,
      stripePriceId: stripe?.priceId || row.stripePriceId,
      stripeStatus: stripe?.status,
      stripeCanonical: stripe?.priceId ? getCanonicalPlanKeyFromPriceId(stripe.priceId) : null,
      monthlyGrant: row.monthlyCreditGrant ?? resolvePlanCreditGrant(row, null),
    };
    rows.push(enriched);
    byRootCause.set(classified.rootCause, (byRootCause.get(classified.rootCause) || 0) + 1);
  }

  // Also include credit-drift-only rows from full audit that aren't in mismatchDetails
  for (const r of audit.rows || []) {
    if (r.creditDrift?.length && !r.planMismatch && !rows.find((x) => x.userId === r.userId)) {
      const classified = classifyPlanRootCause(r);
      if (classified) {
        rows.push({ ...r, ...classified });
        byRootCause.set(classified.rootCause, (byRootCause.get(classified.rootCause) || 0) + 1);
      }
    }
  }

  return {
    totalScanned: audit.subscribers,
    failed: rows.length,
    rows,
    byRootCause: Object.fromEntries(byRootCause),
    counts: { basic: audit.basic, super: audit.super, unlimited: audit.unlimited, campaign: audit.campaign },
  };
}

export async function analyzeAnalyticsFailures(options = {}) {
  const userIds = options.userIds || (await Subscription.distinct("userId")).map(String);
  const rows = [];
  const byRootCause = new Map();
  const byEndpoint = new Map();

  for (const uid of userIds) {
    const result = await auditAnalyticsCreditsForUser(uid);
    if (result.status === "PASS") continue;
    const classified = classifyAnalyticsRootCause(result);
    const row = { ...result, ...classified };
    rows.push(row);
    if (classified?.rootCause) {
      byRootCause.set(classified.rootCause, (byRootCause.get(classified.rootCause) || 0) + 1);
    }
    if (classified?.endpoint) {
      byEndpoint.set(classified.endpoint, (byEndpoint.get(classified.endpoint) || 0) + 1);
    }
  }

  return {
    totalScanned: userIds.length,
    failed: rows.length,
    rows,
    byRootCause: Object.fromEntries(byRootCause),
    byEndpoint: Object.fromEntries(byEndpoint),
  };
}

export async function analyzeMigrationFailures(options = {}) {
  const verification = await runMigrationVerification({
    snapshotName: options.snapshotName || "telecom-credit-migration-v1",
    strictGrants: false,
  });
  const categories = categorizeMigrationFailures(verification);

  // Count subs without migration_reset
  const subs = await Subscription.find({ status: { $in: ["active", "past_due", "pending_activation"] } }).lean();
  let missingReset = 0;
  let hasReset = 0;
  for (const sub of subs) {
    const key = `migration-v1:${String(sub._id)}`;
    const row = await CreditLedger.findOne({ idempotencyKey: key }).select("_id").lean();
    if (row) hasReset += 1;
    else missingReset += 1;
  }

  return {
    ok: verification.ok,
    failureCount: verification.failures.length,
    warningCount: verification.warnings.length,
    failures: verification.failures,
    warnings: verification.warnings,
    summary: verification.summary,
    categories: Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [k, { count: v.length, items: v.slice(0, 20) }])
    ),
    migrationReset: { hasReset, missingReset, activeSubs: subs.length },
  };
}

export async function buildRepairPreview(credits, plans, analytics, migration) {
  const previews = [];

  for (const [cause, count] of Object.entries(credits.byRootCause || {})) {
    const sample = credits.rows.find((r) => r.rootCause === cause);
    previews.push({
      category: "Credits",
      affectedUsers: count,
      rootCause: cause,
      reason: sample?.rootCauseDetail || cause,
      repair: sample?.recommendedRepair || "See RCA",
      risk: sample?.risk || "medium",
      safe: sample?.risk === "low" && sample?.repairRequired,
    });
  }

  for (const [cause, count] of Object.entries(plans.byRootCause || {})) {
    const sample = plans.rows.find((r) => r.rootCause === cause);
    previews.push({
      category: "Plans",
      affectedUsers: count,
      rootCause: cause,
      reason: sample?.why || cause,
      repair: sample?.repair || "See RCA",
      risk: sample?.risk || "medium",
      safe: sample?.repairRequired && sample?.risk !== "high",
    });
  }

  for (const [cause, count] of Object.entries(analytics.byRootCause || {})) {
    const sample = analytics.rows.find((r) => r.rootCause === cause);
    previews.push({
      category: "Analytics",
      affectedRecords: count,
      rootCause: cause,
      reason: sample?.pipeline || cause,
      repair: sample?.repair || "Fix upstream authority",
      risk: sample?.risk || "low",
      safe: sample?.repairRequired && sample?.risk === "low",
    });
  }

  for (const [cat, data] of Object.entries(migration.categories || {})) {
    if (data.count > 0) {
      previews.push({
        category: "Migration",
        affectedRecords: data.count,
        rootCause: cat,
        reason: data.items?.[0] || cat,
        repair: "Category-specific — see migration failures list",
        risk: cat.includes("negative") ? "high" : "medium",
        safe: false,
      });
    }
  }

  return previews;
}

export async function runFullFailureAnalysis(options = {}) {
  process.env.TELECOM_BILLING_TRACE = "0";

  const [credits, plans, analytics, migration] = await Promise.all([
    analyzeCreditsFailures(options),
    analyzePlansFailures(options),
    analyzeAnalyticsFailures(options),
    analyzeMigrationFailures(options),
  ]);

  const repairPreview = await buildRepairPreview(credits, plans, analytics, migration);

  return {
    ranAt: new Date().toISOString(),
    healthContext: {
      passCategories: ["Billing", "Numbers", "Stripe", "Ledger", "Reservations"],
      failCategories: ["Credits", "Plans", "Analytics", "Migration"],
    },
    credits,
    plans,
    analytics,
    migration,
    repairPreview,
    totals: {
      creditFailures: credits.failed,
      planFailures: plans.failed,
      analyticsFailures: analytics.failed,
      migrationFailures: migration.failureCount,
      subscribersScanned: credits.totalScanned,
    },
  };
}
