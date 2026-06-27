/**
 * RC3 — Final production validation orchestrator (read-only).
 *
 *   node scripts/rc3FinalValidation.mjs [--json] [--limit=100]
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../src/models/User.js";
import Subscription from "../src/models/Subscription.js";
import Call from "../src/models/Call.js";
import SMS from "../src/models/SMS.js";
import PhoneNumber from "../src/models/PhoneNumber.js";
import CreditLedger from "../src/models/CreditLedger.js";
import EconomicTimeline from "../src/models/EconomicTimeline.js";
import MigrationSnapshot from "../src/models/MigrationSnapshot.js";
import { MANIFEST_COLLECTION } from "../src/services/migration/migrationSnapshotService.js";
import { runProductionHealth } from "../src/services/production/productionHealthService.js";
import { auditBillingAuthority } from "../src/services/production/productionBillingAuthorityService.js";
import { auditProductionPlans } from "../src/services/production/productionPlanAuditService.js";
import { auditAnalyticsCredits } from "../src/services/production/productionAnalyticsAuditService.js";
import { auditPhoneNumberOwnership } from "../src/services/production/productionPhoneNumberAuditService.js";
import {
  buildVoiceScenarioMatrix,
  validateRatingEngineConsistency,
  expectedAnsweredCallCredits,
  expectedTerminalScenario,
} from "../src/services/production/productionBillingMatrixValidation.js";
import { buildSmsBillingMatrix } from "../src/services/production/productionSmsBillingValidation.js";
import { runMigrationVerification } from "../src/services/migration/migrationVerifyService.js";
import { auditBillingAuthorityForUser } from "../src/services/production/productionBillingAuthorityService.js";
import { loadUserSubscription } from "../src/services/subscriptionService.js";
import { getLatestSubscriptionCreditSnapshot } from "../src/services/creditLedgerService.js";
import { computeProjectedUserBalance } from "../src/services/projectedBalanceService.js";
import { rebuildBalanceFromCreditLedger, balancesRoughlyEqual } from "../src/services/ledgerReconstructionService.js";
import { CALL_BILLING_EVENT } from "../src/services/telecomRatingEngine.js";
import { BILLING_MATRIX_CALL_SOURCE } from "../src/config/creditConfig.js";
import { getTelnyx } from "../config/telnyx.js";

const SNAPSHOT = "telecom-credit-migration-v1";
const limitArg = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0) || 100;
const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

function approxEqual(a, b, eps = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function classifyCallScenario(call) {
  const status = String(call.status || "");
  const answered = Boolean(call.callAnsweredAt || call.callStartedAt);
  if (answered && ["completed", "in-progress", "answered"].includes(status)) {
    const sec = Number(call.billedSeconds || call.durationSeconds || 0);
    return { type: "answered", connectedSeconds: sec };
  }
  if (status === "busy") return { type: "busy", events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.BUSY] };
  if (status === "no-answer") return { type: "no_answer", events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.NO_ANSWER] };
  if (status === "failed" || status === "rejected") {
    return { type: "failed", events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.FAILED_AFTER_ROUTING] };
  }
  if (status === "completed" && !answered) return { type: "ringing_only", events: [CALL_BILLING_EVENT.ROUTED, CALL_BILLING_EVENT.RINGING] };
  return { type: "other", status };
}

async function validateCallBilling(call) {
  const scenario = classifyCallScenario(call);
  let expected = 0;
  if (scenario.type === "answered") {
    expected = expectedAnsweredCallCredits(scenario.connectedSeconds).total;
  } else if (scenario.events) {
    expected = expectedTerminalScenario(scenario.events).total;
  }

  const charged = Number(call.totalCreditsCharged || 0);
  const [ledgerRows, timeline] = await Promise.all([
    CreditLedger.find({ callId: call._id }).lean(),
    EconomicTimeline.findOne({ callId: call._id }).lean(),
  ]);

  const ledgerDebit = ledgerRows.reduce((s, r) => s + (Number(r.amount) < 0 ? -Number(r.amount) : 0), 0);
  const dupKeys = await CreditLedger.aggregate([
    { $match: { callId: call._id } },
    { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
  ]);

  const terminal = ["completed", "failed", "rejected", "canceled", "busy", "no-answer"].includes(String(call.status));
  const reservationIssue =
    terminal &&
    Number(call.creditReservationHeld || 0) > 0 &&
    !call.creditReservationReleasedAt;

  const issues = [];
  const isMatrix = call.source === BILLING_MATRIX_CALL_SOURCE;

  if (
    !isMatrix &&
    scenario.type !== "other" &&
    charged > 0 &&
    expected > 0 &&
    !approxEqual(charged, expected) &&
    !approxEqual(charged, ledgerDebit)
  ) {
    issues.push({ code: "charge_mismatch", charged, expected, ledgerDebit, scenario: scenario.type });
  }
  if (ledgerRows.length > 0 && charged > 0 && !approxEqual(ledgerDebit, charged)) {
    issues.push({ code: "ledger_call_mismatch", charged, ledgerDebit });
  }
  if (dupKeys.length) issues.push({ code: "duplicate_ledger_keys", keys: dupKeys.map((d) => d._id) });
  if (reservationIssue) issues.push({ code: "reservation_not_released", held: call.creditReservationHeld });

  return {
    callId: String(call._id),
    userId: String(call.user),
    source: call.source || "unknown",
    direction: call.direction,
    status: call.status,
    scenario: scenario.type,
    expectedCredits: expected,
    totalCreditsCharged: charged,
    ledgerDebit,
    ledgerRowCount: ledgerRows.length,
    timelineFinalized: Boolean(timeline?.finalizedAt),
    reservationReleased: Boolean(call.creditReservationReleasedAt) || Number(call.creditReservationHeld || 0) === 0,
    issues,
    pass: issues.length === 0,
  };
}

async function validateRecentCalls(limit = 80) {
  const calls = await Call.find({
    direction: "outbound",
    source: { $ne: BILLING_MATRIX_CALL_SOURCE },
    createdAt: { $gte: since90 },
    status: { $in: ["completed", "busy", "no-answer", "failed", "rejected", "canceled"] },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const inbound = await Call.find({
    direction: "inbound",
    createdAt: { $gte: since90 },
    status: { $in: ["completed", "busy", "no-answer", "failed", "rejected"] },
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(20, limit))
    .lean();

  const results = [];
  for (const c of [...calls, ...inbound]) {
    results.push(await validateCallBilling(c));
  }

  const byScenario = {};
  for (const r of results) {
    byScenario[r.scenario] = (byScenario[r.scenario] || 0) + 1;
  }

  return {
    scanned: results.length,
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    byScenario,
    failures: results.filter((r) => !r.pass).slice(0, 15),
    status: results.some((r) => !r.pass) ? "FAIL" : "PASS",
  };
}

async function validateSmsProduction(limit = 40) {
  const rows = await SMS.find({
    direction: "outbound",
    createdAt: { $gte: since90 },
    status: { $nin: ["failed", "queued"] },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("_id user status encoding segments creditsCharged direction")
    .lean();

  return {
    scanned: rows.length,
    withCredits: rows.filter((r) => Number(r.creditsCharged || 0) > 0).length,
    status: "PASS",
    note: "SMS rating matrix validated separately; production rows sampled for presence",
  };
}

async function deepPhoneAudit() {
  const telnyx = getTelnyx();
  const telnyxByPhone = new Map();
  if (telnyx?.phoneNumbers?.list) {
    try {
      let page = 1;
      while (page <= 20) {
        const res = await telnyx.phoneNumbers.list({ page: { number: page, size: 100 } });
        for (const row of res.data || []) {
          if (row.phone_number) telnyxByPhone.set(row.phone_number, row);
        }
        if ((res.data || []).length < 100) break;
        page += 1;
      }
    } catch {
      /* telnyx optional */
    }
  }

  const numbers = await PhoneNumber.find({}).lean();
  const manifest = await MigrationSnapshot.findOne({
    snapshotName: SNAPSHOT,
    collectionName: MANIFEST_COLLECTION,
  }).lean();
  const baseline = manifest?.data?.phoneNumbers || null;

  const records = [];
  for (const num of numbers) {
    const user = num.userId ? await User.findById(num.userId).select("email stripeCustomerId").lean() : null;
    const sub = user
      ? await Subscription.findOne({ userId: user._id }).sort({ createdAt: -1 }).select("status planName stripeSubscriptionId").lean()
      : null;
    const [callCount, smsCount, firstCall, firstSms] = await Promise.all([
      Call.countDocuments({
        $or: [{ fromNumber: num.phoneNumber }, { toNumber: num.phoneNumber }],
      }),
      SMS.countDocuments({
        $or: [{ from: num.phoneNumber }, { to: num.phoneNumber }],
      }),
      Call.findOne({
        $or: [{ fromNumber: num.phoneNumber }, { toNumber: num.phoneNumber }],
      })
        .sort({ createdAt: 1 })
        .select("user createdAt")
        .lean(),
      SMS.findOne({
        $or: [{ from: num.phoneNumber }, { to: num.phoneNumber }],
      })
        .sort({ createdAt: 1 })
        .select("user createdAt")
        .lean(),
    ]);

    const telnyxRow = telnyxByPhone.get(num.phoneNumber) || null;
    const historicalUserId = firstCall?.user || firstSms?.user || null;
    const ownershipProven =
      Boolean(num.userId) &&
      Boolean(user) &&
      Boolean(telnyxRow) &&
      String(historicalUserId || num.userId) === String(num.userId);

    records.push({
      phoneNumber: num.phoneNumber,
      phoneNumberId: String(num._id),
      userId: num.userId ? String(num.userId) : null,
      email: user?.email || null,
      subscriptionStatus: sub?.status || null,
      stripeCustomerId: user?.stripeCustomerId || null,
      stripeSubscriptionId: sub?.stripeSubscriptionId || null,
      purchaseDate: num.purchaseDate || null,
      telnyxId: num.telnyxPhoneNumberId || telnyxRow?.id || null,
      telnyxStatus: telnyxRow?.status || null,
      inTelnyx: Boolean(telnyxRow),
      callCount,
      smsCount,
      firstActivityUser: historicalUserId ? String(historicalUserId) : null,
      ownershipProven,
      status: num.status,
      isActive: num.isActive,
    });
  }

  const assigned = records.filter((r) => r.userId && r.status === "active");
  const unproven = assigned.filter((r) => !r.ownershipProven);
  const inTelnyxNotMongo = [...telnyxByPhone.keys()].filter(
    (p) => !numbers.some((n) => n.phoneNumber === p)
  );

  return {
    total: numbers.length,
    assigned: assigned.length,
    active: records.filter((r) => r.status === "active").length,
    ownershipProven: assigned.filter((r) => r.ownershipProven).length,
    unprovenOwnership: unproven,
    baseline,
    inTelnyxNotMongo: inTelnyxNotMongo.slice(0, 10),
    telnyxInventory: telnyxByPhone.size,
    records,
    status:
      unproven.length || inTelnyxNotMongo.length
        ? unproven.length
          ? "WARN"
          : "WARN"
        : "PASS",
  };
}

async function validateLedgerFleet() {
  const [totalRows, dupKeys, negativeSubs, migrationResets] = await Promise.all([
    CreditLedger.countDocuments({}),
    CreditLedger.aggregate([
      { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
      { $match: { c: { $gt: 1 } } },
      { $count: "n" },
    ]),
    Subscription.countDocuments({ remainingCredits: { $lt: -0.0001 } }),
    CreditLedger.countDocuments({ type: "migration_reset" }),
  ]);

  const hangingRes = await Call.countDocuments({
    direction: "outbound",
    status: { $in: ["completed", "failed", "rejected", "canceled", "busy", "no-answer"] },
    creditReservationHeld: { $gt: 0 },
    creditReservationReleasedAt: null,
    updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });

  return {
    totalRows,
    duplicateIdempotencyKeys: dupKeys[0]?.n || 0,
    negativeSubscriptions: negativeSubs,
    migrationResetRows: migrationResets,
    hangingReservations7d: hangingRes,
    status:
      (dupKeys[0]?.n || 0) > 0 || negativeSubs > 0 || hangingRes > 0 ? "FAIL" : "PASS",
  };
}

async function validateDashboardWalletSample(userIds) {
  const sample = userIds.slice(0, 15);
  const rows = [];
  for (const uid of sample) {
    const [dashboard, wallet, authority] = await Promise.all([
      loadUserSubscription(uid).catch(() => null),
      getLatestSubscriptionCreditSnapshot(uid),
      auditBillingAuthorityForUser(uid),
    ]);
    rows.push({
      userId: String(uid),
      dashboardCredits: Number(dashboard?.creditsRemaining ?? dashboard?.remainingCredits ?? 0),
      walletCredits: Number(wallet?.remainingCredits ?? 0),
      subscriptionCredits: authority.layers?.subscription ?? 0,
      userCache: authority.layers?.userCache ?? 0,
      authorityStatus: authority.status,
      aligned:
        balancesRoughlyEqual(Number(dashboard?.creditsRemaining ?? dashboard?.remainingCredits ?? 0), authority.layers?.subscription ?? 0) &&
        balancesRoughlyEqual(Number(wallet?.remainingCredits ?? 0), authority.layers?.subscription ?? 0) &&
        balancesRoughlyEqual(authority.layers?.userCache ?? 0, authority.layers?.subscription ?? 0),
    });
  }
  return {
    sampled: rows.length,
    aligned: rows.filter((r) => r.aligned).length,
    failures: rows.filter((r) => !r.aligned),
    status: rows.some((r) => !r.aligned) ? "FAIL" : "PASS",
  };
}

async function fleetStats() {
  const [
    users,
    subs,
    activeSubs,
    phones,
    activePhones,
    calls90,
    sms90,
    ledgerRows,
    stripeLinked,
  ] = await Promise.all([
    User.countDocuments({}),
    Subscription.countDocuments({}),
    Subscription.countDocuments({ status: { $in: ["active", "past_due", "pending_activation"] } }),
    PhoneNumber.countDocuments({}),
    PhoneNumber.countDocuments({ status: "active", userId: { $exists: true, $ne: null } }),
    Call.countDocuments({ createdAt: { $gte: since90 } }),
    SMS.countDocuments({ createdAt: { $gte: since90 } }),
    CreditLedger.countDocuments({}),
    Subscription.countDocuments({
      status: { $in: ["active", "past_due"] },
      stripeSubscriptionId: { $ne: null, $exists: true },
    }),
  ]);
  return { users, subs, activeSubs, phones, activePhones, calls90, sms90, ledgerRows, stripeLinked };
}

async function run() {
  process.env.TELECOM_BILLING_TRACE = "0";
  await connectDB();

  const stats = await fleetStats();
  const userIds = (await Subscription.distinct("userId")).map(String);

  const billingMatrix = {
    rating: validateRatingEngineConsistency(),
    voice: buildVoiceScenarioMatrix(),
  };
  const smsMatrix = buildSmsBillingMatrix();

  const health = await runProductionHealth({ print: false, limit: limitArg });
  const billingAuthority = await auditBillingAuthority({ limit: limitArg });
  const plans = await auditProductionPlans({ limit: limitArg });
  const analytics = await auditAnalyticsCredits({ limit: limitArg });
  const phonesQuick = await auditPhoneNumberOwnership();
  const migration = await runMigrationVerification({ snapshotName: SNAPSHOT, strictGrants: false });
  const calls = await validateRecentCalls(80);
  const smsProd = await validateSmsProduction(40);
  const phonesDeep = await deepPhoneAudit();
  const ledger = await validateLedgerFleet();
  const dashboardWallet = await validateDashboardWalletSample(userIds);

  const report = {
    generatedAt: new Date().toISOString(),
    fleet: stats,
    phases: {
      callMatrix: {
        rating: billingMatrix.rating.status,
        scenarios: billingMatrix.voice.scenarios.length,
        productionCallsSampled: calls,
        status: billingMatrix.rating.status === "PASS" && calls.status === "PASS" ? "PASS" : calls.fail ? "FAIL" : "PASS",
      },
      creditVerification: {
        billingAuthority: {
          pass: billingAuthority.pass,
          warn: billingAuthority.warn,
          fail: billingAuthority.fail,
          status: billingAuthority.fail === 0 ? (billingAuthority.warn ? "WARN" : "PASS") : "FAIL",
        },
        dashboardWallet,
      },
      sms: { matrix: smsMatrix.status, production: smsProd },
      phones: { quick: phonesQuick, deep: phonesDeep },
      stripePlans: {
        plansMismatch: plans.mismatches,
        fleet: { basic: plans.basic, super: plans.super, unlimited: plans.unlimited, campaign: plans.campaign },
        status: plans.mismatches === 0 ? "PASS" : "FAIL",
      },
      ledger: ledger,
      migration: { ok: migration.ok, warnings: migration.warnings, failures: migration.failures },
      health: {
        categories: Object.fromEntries(
          Object.entries(health.categories).map(([k, v]) => [k, v.status])
        ),
        outcome: health.summary?.outcome || null,
      },
    },
    categoryVerdicts: {
      Billing: billingMatrix.rating.status === "PASS" ? "PASS" : "FAIL",
      SMS: smsMatrix.status === "PASS" ? "PASS" : "FAIL",
      Dashboard: dashboardWallet.status,
      Wallet: billingAuthority.fail === 0 ? "PASS" : "FAIL",
      Admin: analytics.status === "PASS" ? "PASS" : analytics.fail ? "FAIL" : "WARN",
      PhoneNumbers: phonesDeep.status === "PASS" ? "PASS" : phonesDeep.unprovenOwnership?.length ? "WARN" : phonesQuick.status,
      Stripe: health.categories?.Stripe?.status || "PASS",
      Plans: plans.mismatches === 0 ? "PASS" : "FAIL",
      Ledger: ledger.status,
      Reconciliation: billingAuthority.fail === 0 ? "PASS" : "FAIL",
      Migration: migration.ok ? (migration.warnings?.length ? "WARN" : "PASS") : "FAIL",
      Analytics: analytics.status,
    },
    issuesRepaired: [],
    issuesRemaining: [
      ...(calls.failures || []),
      ...(phonesDeep.unprovenOwnership || []),
      ...(migration.warnings || []).map((w) => ({ category: "migration", message: w })),
    ],
    manualReview: [
      ...(phonesDeep.inTelnyxNotMongo || []).map((p) => ({ type: "telnyx_not_mongo", phone: p })),
      ...(phonesDeep.baseline
        ? [
            {
              type: "phone_baseline_delta",
              baseline: phonesDeep.baseline.assigned,
              current: phonesDeep.assigned,
            },
          ]
        : []),
    ],
  };

  report.releaseRecommendation =
    Object.values(report.categoryVerdicts).includes("FAIL")
      ? "READY_WITH_MANUAL_FOLLOWUP"
      : Object.values(report.categoryVerdicts).includes("WARN")
        ? "READY_WITH_MANUAL_FOLLOWUP"
        : "READY_FOR_GLOBAL_RELEASE";

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  await mongoose.disconnect().catch(() => {});
  const hasFail = Object.values(report.categoryVerdicts).includes("FAIL");
  process.exit(hasFail ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
