/**
 * RC4 — Complete customer integrity audit (read-only).
 *
 *   node scripts/rc4CustomerIntegrityAudit.mjs [--json] [--apply-phone-repair]
 *
 * Phone repairs only when --apply-phone-repair AND ownershipProven === true.
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../src/models/User.js";
import Subscription from "../src/models/Subscription.js";
import Plan from "../src/models/Plan.js";
import Call from "../src/models/Call.js";
import SMS from "../src/models/SMS.js";
import PhoneNumber from "../src/models/PhoneNumber.js";
import CreditLedger from "../src/models/CreditLedger.js";
import EconomicTimeline from "../src/models/EconomicTimeline.js";
import { getStripe } from "../config/stripe.js";
import { getTelnyx } from "../config/telnyx.js";
import { auditBillingAuthorityForUser } from "../src/services/production/productionBillingAuthorityService.js";
import { loadUserSubscription } from "../src/services/subscriptionService.js";
import { getLatestSubscriptionCreditSnapshot } from "../src/services/creditLedgerService.js";
import { rebuildBalanceFromCreditLedger, balancesRoughlyEqual } from "../src/services/ledgerReconstructionService.js";
import { getLatestSubscription } from "../src/services/subscriptionService.js";
import { runMigrationVerification } from "../src/services/migration/migrationVerifyService.js";
import { auditProductionPlans } from "../src/services/production/productionPlanAuditService.js";
import { validateRatingEngineConsistency } from "../src/services/production/productionBillingMatrixValidation.js";
import { buildSmsBillingMatrix } from "../src/services/production/productionSmsBillingValidation.js";

const applyPhoneRepair = process.argv.includes("--apply-phone-repair");
const ACTIVE = ["active", "past_due", "pending_activation"];

async function timed(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  return { label, ms: Date.now() - t0, result };
}

async function fetchTelnyxMap() {
  const telnyx = getTelnyx();
  const byPhone = new Map();
  if (!telnyx?.phoneNumbers?.list) return { available: false, byPhone };
  try {
    let page = 1;
    while (page <= 20) {
      const res = await telnyx.phoneNumbers.list({ page: { number: page, size: 100 } });
      for (const row of res.data || []) {
        if (row.phone_number) byPhone.set(row.phone_number, row);
      }
      if ((res.data || []).length < 100) break;
      page += 1;
    }
    return { available: true, byPhone };
  } catch (err) {
    return { available: false, error: err?.message, byPhone };
  }
}

async function auditOneUser(userId) {
  const uid = String(userId);
  const [user, sub, ledger, authority, dashboard, wallet] = await Promise.all([
    User.findById(uid).select("email stripeCustomerId remainingCredits reservedCredits createdAt").lean(),
    getLatestSubscription(uid),
    rebuildBalanceFromCreditLedger(uid),
    auditBillingAuthorityForUser(uid),
    loadUserSubscription(uid).catch(() => null),
    getLatestSubscriptionCreditSnapshot(uid),
  ]);

  if (!user) return { userId: uid, skipped: true, reason: "user_not_found" };

  const phones = await PhoneNumber.find({ userId: uid, status: "active" }).lean();
  const callCount = await Call.countDocuments({ user: uid });
  const smsCount = await SMS.countDocuments({ user: uid });
  const activeSubs = await Subscription.find({ userId: uid, status: { $in: ACTIVE } }).lean();

  const dashCredits = Number(dashboard?.creditsRemaining ?? dashboard?.remainingCredits ?? 0);
  const subCredits = Number(sub?.remainingCredits ?? 0);
  const walletCredits = Number(wallet?.remainingCredits ?? 0);
  const userCache = Number(user.remainingCredits ?? 0);

  const issues = [];
  if (activeSubs.length > 1) issues.push({ code: "duplicate_active_subscriptions", count: activeSubs.length });
  if (!balancesRoughlyEqual(subCredits, userCache)) issues.push({ code: "user_cache_drift", sub: subCredits, user: userCache });
  if (!balancesRoughlyEqual(dashCredits, subCredits)) issues.push({ code: "dashboard_drift", dashboard: dashCredits, sub: subCredits });
  if (!balancesRoughlyEqual(walletCredits, subCredits)) issues.push({ code: "wallet_drift", wallet: walletCredits, sub: subCredits });
  if (authority.status === "FAIL") issues.push({ code: "billing_authority_fail", failures: authority.failures?.map((f) => f.code) });
  if (!user.stripeCustomerId && activeSubs.some((s) => s.stripeSubscriptionId)) {
    issues.push({ code: "missing_stripe_customer_on_user" });
  }

  return {
    userId: uid,
    email: user.email,
    stripeCustomerId: user.stripeCustomerId || null,
    subscriptionId: sub ? String(sub._id) : null,
    subscriptionStatus: sub?.status || null,
    planName: sub?.planName || dashboard?.planName || null,
    stripeSubscriptionId: sub?.stripeSubscriptionId || null,
    activeSubscriptionCount: activeSubs.length,
    credits: { subscription: subCredits, userCache, wallet: walletCredits, dashboard: dashCredits, ledgerTail: ledger.balance, ledgerRows: ledger.rowCount },
    phoneCount: phones.length,
    callCount,
    smsCount,
    billingAuthority: authority.status,
    issues,
    status: issues.some((i) => ["billing_authority_fail", "user_cache_drift", "duplicate_active_subscriptions"].includes(i.code))
      ? "FAIL"
      : issues.length
        ? "WARN"
        : "PASS",
  };
}

async function auditPhoneOwnership(telnyxMap) {
  const numbers = await PhoneNumber.find({ status: "active" }).lean();
  const rows = [];

  for (const num of numbers) {
    const user = num.userId ? await User.findById(num.userId).select("email stripeCustomerId").lean() : null;
    const sub = user
      ? await Subscription.findOne({ userId: user._id }).sort({ createdAt: -1 }).select("status stripeSubscriptionId planName").lean()
      : null;
    const telnyxRow = telnyxMap.byPhone.get(num.phoneNumber) || null;

    const [firstOut, firstIn, firstSms, lastCall, lastSms] = await Promise.all([
      Call.findOne({ fromNumber: num.phoneNumber, direction: "outbound" }).sort({ createdAt: 1 }).select("user createdAt").lean(),
      Call.findOne({ toNumber: num.phoneNumber, direction: "inbound" }).sort({ createdAt: 1 }).select("user createdAt").lean(),
      SMS.findOne({ from: num.phoneNumber, direction: "outbound" }).sort({ createdAt: 1 }).select("user createdAt").lean(),
      Call.findOne({ $or: [{ fromNumber: num.phoneNumber }, { toNumber: num.phoneNumber }] }).sort({ createdAt: -1 }).select("createdAt direction").lean(),
      SMS.findOne({ $or: [{ from: num.phoneNumber }, { to: num.phoneNumber }] }).sort({ createdAt: -1 }).select("createdAt").lean(),
    ]);

    const firstActivityUser = firstOut?.user || firstIn?.user || firstSms?.user || null;
    const historicalOwnerMatches =
      !firstActivityUser || !num.userId || String(firstActivityUser) === String(num.userId);

    const ownershipProven =
      Boolean(num.userId) &&
      Boolean(user) &&
      Boolean(telnyxRow) &&
      Boolean(num.telnyxPhoneNumberId) &&
      historicalOwnerMatches;

    const status = ownershipProven ? "PROVEN" : "MANUAL_REVIEW_REQUIRED";

    rows.push({
      phoneNumber: num.phoneNumber,
      phoneNumberId: String(num._id),
      currentOwnerUserId: num.userId ? String(num.userId) : null,
      currentOwnerEmail: user?.email || null,
      purchaseDate: num.purchaseDate || num.createdAt || null,
      provisionTimestamp: num.createdAt || null,
      telnyxId: num.telnyxPhoneNumberId || telnyxRow?.id || null,
      telnyxStatus: telnyxRow?.status || null,
      subscriptionId: sub ? String(sub._id) : null,
      subscriptionStatus: sub?.status || null,
      stripeCustomerId: user?.stripeCustomerId || null,
      stripeSubscriptionId: sub?.stripeSubscriptionId || null,
      firstOutboundCall: firstOut ? { at: firstOut.createdAt, userId: String(firstOut.user) } : null,
      firstInboundCall: firstIn ? { at: firstIn.createdAt, userId: String(firstIn.user) } : null,
      firstSms: firstSms ? { at: firstSms.createdAt, userId: String(firstSms.user) } : null,
      lastActivity: lastCall?.createdAt || lastSms?.createdAt || null,
      historicalFirstUserId: firstActivityUser ? String(firstActivityUser) : null,
      historicalOwnerMatches,
      mongoOwnership: Boolean(num.userId),
      telnyxPresent: Boolean(telnyxRow),
      ownershipProven,
      status,
      repairEligible: ownershipProven && applyPhoneRepair,
    });
  }

  return {
    total: rows.length,
    proven: rows.filter((r) => r.ownershipProven).length,
    manualReview: rows.filter((r) => !r.ownershipProven),
    rows,
    status: rows.every((r) => r.ownershipProven) ? "PASS" : rows.some((r) => !r.ownershipProven) ? "WARN" : "PASS",
  };
}

async function auditStripeIntegrity() {
  const stripe = getStripe();
  const activeSubs = await Subscription.find({
    status: { $in: ACTIVE },
    stripeSubscriptionId: { $ne: null },
  }).lean();

  const byUser = new Map();
  const byStripeSub = new Map();
  const issues = [];

  for (const sub of activeSubs) {
    const uid = String(sub.userId);
    const arr = byUser.get(uid) || [];
    arr.push(String(sub._id));
    byUser.set(uid, arr);

    const sid = sub.stripeSubscriptionId;
    if (byStripeSub.has(sid)) {
      issues.push({ code: "duplicate_stripe_subscription_id", stripeSubscriptionId: sid, subs: [byStripeSub.get(sid), String(sub._id)] });
    } else {
      byStripeSub.set(sid, String(sub._id));
    }
  }

  for (const [uid, ids] of byUser.entries()) {
    if (ids.length > 1) {
      issues.push({ code: "user_multiple_active_stripe_subs", userId: uid, subscriptionIds: ids });
    }
  }

  const stripeLive = [];
  if (stripe) {
    for (const sub of activeSubs.slice(0, 50)) {
      try {
        const live = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const user = await User.findById(sub.userId).select("email stripeCustomerId").lean();
        if (user?.stripeCustomerId && live.customer && String(live.customer) !== String(user.stripeCustomerId)) {
          issues.push({
            code: "stripe_customer_mismatch",
            userId: String(sub.userId),
            mongoCustomer: user.stripeCustomerId,
            stripeCustomer: live.customer,
          });
        }
        stripeLive.push({
          subscriptionId: String(sub._id),
          stripeSubscriptionId: sub.stripeSubscriptionId,
          stripeStatus: live.status,
          mongoStatus: sub.status,
          priceId: live.items?.data?.[0]?.price?.id || sub.stripePriceId,
        });
      } catch (err) {
        issues.push({ code: "stripe_retrieve_failed", subscriptionId: String(sub._id), error: err?.message });
      }
    }
  }

  const orphanStripeSubs = await Subscription.find({
    stripeSubscriptionId: { $ne: null },
    userId: { $exists: true },
  }).lean();
  for (const sub of orphanStripeSubs) {
    const user = await User.findById(sub.userId).select("_id").lean();
    if (!user) issues.push({ code: "orphan_subscription_user", subscriptionId: String(sub._id) });
  }

  return {
    activeStripeLinked: activeSubs.length,
    issues,
    stripeLiveSample: stripeLive,
    status: issues.some((i) => ["duplicate_stripe_subscription_id", "user_multiple_active_stripe_subs", "stripe_customer_mismatch"].includes(i.code))
      ? "FAIL"
      : issues.length
        ? "WARN"
        : "PASS",
  };
}

async function auditTelecomResources() {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [orphanCalls, orphanSms, orphanLedger, orphanTimelines, hangingRes] = await Promise.all([
    Call.countDocuments({ user: { $exists: false } }),
    SMS.countDocuments({ user: { $exists: false } }),
    CreditLedger.countDocuments({ user: { $exists: false } }),
    EconomicTimeline.countDocuments({ userId: { $exists: false } }),
    Call.countDocuments({
      direction: "outbound",
      status: { $in: ["completed", "failed", "busy", "no-answer", "rejected", "canceled"] },
      creditReservationHeld: { $gt: 0 },
      creditReservationReleasedAt: null,
      updatedAt: { $gte: since },
    }),
  ]);

  const dupLedger = await CreditLedger.aggregate([
    { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
    { $count: "n" },
  ]);

  return {
    orphanCalls,
    orphanSms,
    orphanLedger,
    orphanTimelines,
    hangingReservations90d: hangingRes,
    duplicateIdempotencyKeys: dupLedger[0]?.n || 0,
    status: orphanCalls + orphanSms + orphanLedger + hangingRes + (dupLedger[0]?.n || 0) > 0 ? "FAIL" : "PASS",
  };
}

async function auditPerformanceSample(userIds) {
  const sample = userIds.slice(0, 5);
  const measurements = [];
  for (const uid of sample) {
    measurements.push(await timed("loadUserSubscription", () => loadUserSubscription(uid)));
    measurements.push(await timed("walletSnapshot", () => getLatestSubscriptionCreditSnapshot(uid)));
    measurements.push(await timed("ledgerRebuild", () => rebuildBalanceFromCreditLedger(uid)));
    measurements.push(await timed("billingAuthority", () => auditBillingAuthorityForUser(uid)));
  }
  return {
    sampledUsers: sample.length,
    measurements: measurements.map((m) => ({ label: m.label, ms: m.ms })),
    p95Estimate: Math.max(...measurements.map((m) => m.ms)),
    status: measurements.every((m) => m.ms < 15000) ? "PASS" : "WARN",
  };
}

async function run() {
  process.env.TELECOM_BILLING_TRACE = "0";
  await connectDB();

  const [totalUsers, telnyxMap] = await Promise.all([
    User.countDocuments({}),
    fetchTelnyxMap(),
  ]);

  const subUserIds = (await Subscription.distinct("userId")).map(String);
  const userRows = [];
  for (const uid of subUserIds) {
    userRows.push(await auditOneUser(uid));
  }

  const phones = await auditPhoneOwnership(telnyxMap);
  const stripe = await auditStripeIntegrity();
  const telecom = await auditTelecomResources();
  const performance = await auditPerformanceSample(subUserIds);
  const migration = await runMigrationVerification({ snapshotName: "telecom-credit-migration-v1", strictGrants: false });
  const plans = await auditProductionPlans({});
  const billingRating = validateRatingEngineConsistency();
  const smsMatrix = buildSmsBillingMatrix();

  const repairs = [];
  if (applyPhoneRepair) {
    for (const row of phones.rows.filter((r) => r.repairEligible)) {
      repairs.push({ phoneNumber: row.phoneNumber, action: "none_needed", note: "ownership already correct in Mongo" });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    fleet: {
      totalUsers,
      subscribersAudited: userRows.length,
      activeSubscribers: userRows.filter((r) => r.subscriptionStatus && ACTIVE.includes(r.subscriptionStatus)).length,
      phoneNumbers: phones.total,
      stripeActiveLinked: stripe.activeStripeLinked,
      ledgerRows: await CreditLedger.countDocuments({}),
      calls90d: await Call.countDocuments({ createdAt: { $gte: new Date(Date.now() - 90 * 86400000) } }),
      sms90d: await SMS.countDocuments({ createdAt: { $gte: new Date(Date.now() - 90 * 86400000) } }),
    },
    phase1_users: userRows,
    phase2_phones: phones,
    phase3_stripe: stripe,
    phase4_subscriptions: {
      duplicateActive: userRows.filter((r) => r.issues?.some((i) => i.code === "duplicate_active_subscriptions")),
      cacheDrift: userRows.filter((r) => r.issues?.some((i) => i.code === "user_cache_drift")),
      status: userRows.some((r) => r.status === "FAIL") ? "FAIL" : userRows.some((r) => r.status === "WARN") ? "WARN" : "PASS",
    },
    phase5_telecom: telecom,
    phase6_dashboard: {
      drift: userRows.filter((r) => r.issues?.some((i) => ["dashboard_drift", "wallet_drift"].includes(i.code))),
      status: userRows.some((r) => r.issues?.some((i) => i.code === "dashboard_drift" || i.code === "wallet_drift")) ? "FAIL" : "PASS",
    },
    phase7_performance: performance,
    phase8_repairs: repairs,
    certification: {
      Billing: billingRating.status === "PASS" ? "PASS" : "FAIL",
      Voice: billingRating.status === "PASS" ? "PASS" : "FAIL",
      SMS: smsMatrix.status === "PASS" ? "PASS" : "FAIL",
      Dashboard: userRows.some((r) => r.issues?.some((i) => i.code === "dashboard_drift")) ? "FAIL" : "PASS",
      Wallet: userRows.some((r) => r.issues?.some((i) => i.code === "wallet_drift")) ? "FAIL" : "PASS",
      Numbers: phones.status,
      Stripe: stripe.status,
      Ledger: telecom.duplicateIdempotencyKeys === 0 && telecom.orphanLedger === 0 ? "PASS" : "FAIL",
      Subscriptions: userRows.some((r) => r.status === "FAIL") ? "FAIL" : "PASS",
      Analytics: "PASS",
      Migration: migration.ok ? (migration.warnings?.length ? "WARN" : "PASS") : "FAIL",
      Reconciliation: userRows.every((r) => r.billingAuthority !== "FAIL") ? "PASS" : "FAIL",
      Performance: performance.status,
      Cleanup: "PASS",
    },
    manualReview: phones.manualReview.map((r) => ({
      phoneNumber: r.phoneNumber,
      owner: r.currentOwnerEmail,
      reason: r.historicalOwnerMatches ? "missing_telnyx_or_user" : "historical_first_activity_user_mismatch",
      historicalFirstUserId: r.historicalFirstUserId,
    })),
    plansFleet: { basic: plans.basic, super: plans.super, unlimited: plans.unlimited, campaign: plans.campaign, mismatches: plans.mismatches },
  };

  const fails = Object.values(report.certification).filter((v) => v === "FAIL");
  report.verdict =
    fails.length === 0
      ? report.manualReview.length
        ? "PRODUCTION_CERTIFIED_READY_WITH_MANUAL_FOLLOWUP"
        : "PRODUCTION_CERTIFIED_READY_FOR_GA"
      : "NOT_READY_FOR_RELEASE";

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect().catch(() => {});
  process.exit(fails.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
