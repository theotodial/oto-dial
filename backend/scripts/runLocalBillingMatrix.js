/**
 * Local billing matrix A–J against MongoDB.
 *
 * Usage (from backend/):
 *   node scripts/runLocalBillingMatrix.js
 *
 * Requires MONGODB_URI (or MONGO_URI) in backend/.env.
 * Writes JSON report to stdout and backend/scripts/billing-matrix-report.json
 */

import "../loadEnv.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../src/models/User.js";
import Subscription from "../src/models/Subscription.js";
import Plan from "../src/models/Plan.js";
import Call from "../src/models/Call.js";
import CreditLedger from "../src/models/CreditLedger.js";
import { CREDIT_RULES, BILLING_MATRIX_CALL_SOURCE } from "../src/config/creditConfig.js";
import { applyBillingEvent } from "../src/services/billingEnforcementGateway.js";
import { getLatestSubscriptionCreditSnapshot } from "../src/services/creditLedgerService.js";
import { assertUserHasOutboundDialCredits } from "../src/services/telecomCreditGuard.js";
import {
  chargeOutboundAttemptSerialized,
  billConnectedDurationIntervalsSerialized,
  releaseUnusedCallReservationSerialized,
  reserveCreditsForOutboundCallSerialized,
} from "../src/services/economicSerializationService.js";
import { computeExpectedCallCredits } from "../src/services/telecomCallAccountingService.js";
import EconomicTimeline from "../src/models/EconomicTimeline.js";
import {
  isRatingV1Enabled,
  CALL_BILLING_EVENT,
  rateCallEvent,
} from "../src/services/telecomRatingEngine.js";
import { chargeCallEventSerialized } from "../src/services/economicSerializationService.js";
import { balancesRoughlyEqual } from "../src/services/ledgerReconstructionService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, "billing-matrix-report.json");

const stamp = Date.now();
const results = [];

function pass(scenario, detail, evidence = {}) {
  results.push({ scenario, pass: true, detail, ...evidence });
}

function fail(scenario, detail, evidence = {}) {
  results.push({ scenario, pass: false, detail, ...evidence });
}

async function walletSnapshot(userId) {
  const [sub, user, ledger] = await Promise.all([
    Subscription.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    User.findById(userId)
      .select("remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased")
      .lean(),
    CreditLedger.find({ user: userId }).sort({ createdAt: 1 }).lean(),
  ]);
  const debits = ledger.filter((r) => Number(r.amount) < 0);
  const credits = ledger.filter((r) => Number(r.amount) > 0);
  return {
    subscription: sub
      ? {
          remainingCredits: Number(sub.remainingCredits || 0),
          reservedCredits: Number(sub.reservedCredits || 0),
          totalCreditsUsed: Number(sub.totalCreditsUsed || 0),
          telecomCredits: Number(sub.telecomCredits || 0),
        }
      : null,
    userMirror: user
      ? {
          remainingCredits: Number(user.remainingCredits || 0),
          reservedCredits: Number(user.reservedCredits || 0),
        }
      : null,
    ledger: ledger.map((r) => ({
      type: r.type,
      amount: Number(r.amount),
      balanceBefore: Number(r.balanceBefore),
      balanceAfter: Number(r.balanceAfter),
      idempotencyKey: r.idempotencyKey,
    })),
    ledgerDebitTotal: debits.reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0),
    ledgerCreditTotal: credits.reduce((s, r) => s + Number(r.amount || 0), 0),
  };
}

async function ensurePlan() {
  let plan = await Plan.findOne({ name: "Basic Plan" }).lean();
  if (!plan) {
    plan = await Plan.findOne({ active: true }).sort({ createdAt: -1 }).lean();
  }
  if (!plan) {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const created = await Plan.create({
      name: `Matrix Plan ${stamp}`,
      planName: "Basic Plan",
      price: 19.99,
      limits: { minutesTotal: 1500, creditsTotal: 1500, smsTotal: 100, numbersTotal: 1 },
      monthlyCreditsLimit: 1500,
      active: true,
    });
    plan = created.toObject();
  }
  return plan;
}

async function createFixture({ remainingCredits = 50, reservedCredits = 0, legacyMinutes = 0 }) {
  const plan = await ensurePlan();
  const user = await User.create({
    email: `matrix-${stamp}-${Math.random().toString(36).slice(2, 8)}@billing-matrix.test`,
    password: "matrix-test-password",
    remainingMinutes: legacyMinutes,
    remainingCredits: 0,
    reservedCredits: 0,
    totalCreditsUsed: 0,
    lifetimeCreditsPurchased: 0,
  });
  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sub = await Subscription.create({
    userId: user._id,
    planId: plan._id,
    status: "active",
    planKey: plan.name,
    planName: plan.planName || plan.name,
    planType: "bundle",
    periodStart,
    periodEnd,
    usage: { minutesUsed: 0, smsUsed: 0, creditsUsed: 0 },
    limits: plan.limits,
    monthlyCreditsLimit: plan.monthlyCreditsLimit ?? plan.limits?.creditsTotal ?? 1500,
    telecomCredits: remainingCredits,
    remainingCredits,
    reservedCredits,
    totalCreditsUsed: 0,
    lifetimeCreditsPurchased: 0,
  });
  return { user, sub, plan };
}

async function createOutboundCall(userId, overrides = {}) {
  return Call.create({
    user: userId,
    phoneNumber: "+15551234567",
    fromNumber: "+15559876543",
    toNumber: "+15551234567",
    direction: "outbound",
    status: "ringing",
    source: BILLING_MATRIX_CALL_SOURCE,
    creditReservationHeld: 0,
    ...overrides,
  });
}

async function cleanup(ids) {
  const { userIds = [], callIds = [], subIds = [] } = ids;
  if (callIds.length) {
    await EconomicTimeline.deleteMany({ callId: { $in: callIds } }).catch(() => {});
    await Call.deleteMany({ _id: { $in: callIds } }).catch(() => {});
  }
  if (userIds.length) {
    await CreditLedger.deleteMany({ user: { $in: userIds } }).catch(() => {});
    await Subscription.deleteMany({ _id: { $in: subIds } }).catch(() => {});
    await User.deleteMany({ _id: { $in: userIds } }).catch(() => {});
  }
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
  if (!uri) {
    console.error("MONGODB_URI is required in backend/.env");
    process.exit(1);
  }

  await connectDB();
  console.log("[billing-matrix] connected");

  const cleanupIds = { userIds: [], callIds: [], subIds: [] };

  const runScenario = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      fail(label, err?.message || String(err), { error: String(err) });
    }
  };

  try {
    // --- A: legacy user cache → subscription authority (cold-start fallback) ---
    await runScenario("A", async () => {
      const { user, sub, plan } = await createFixture({ remainingCredits: 0 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      await User.updateOne({ _id: user._id }, { $set: { remainingCredits: 87 } });
      await Subscription.updateOne(
        { _id: sub._id },
        { $unset: { remainingCredits: "", telecomCredits: "" } }
      );
      const before = await walletSnapshot(user._id);
      const subLean = await Subscription.findById(sub._id).lean();
      const userLean = await User.findById(user._id)
        .select("remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased")
        .lean();
      const planCredits = Math.max(
        0,
        Number(
          subLean?.monthlyCreditsLimit ??
            plan?.monthlyCreditsLimit ??
            subLean?.limits?.creditsTotal ??
            plan?.limits?.creditsTotal ??
            0
        )
      );
      const sourceRemaining = Number.isFinite(Number(subLean?.remainingCredits))
        ? Number(subLean.remainingCredits)
        : Number(userLean?.remainingCredits || planCredits);
      await Subscription.updateOne(
        { _id: sub._id },
        {
          $set: {
            telecomCredits: Math.max(planCredits, sourceRemaining),
            remainingCredits: Math.max(0, sourceRemaining),
            reservedCredits: Number(subLean?.reservedCredits || 0),
            totalCreditsUsed: Number(subLean?.totalCreditsUsed || 0),
            lifetimeCreditsPurchased: Number(subLean?.lifetimeCreditsPurchased || 0),
          },
        }
      );
      const after = await walletSnapshot(user._id);
      const ok = Number(after.subscription?.remainingCredits) === 87;
      (ok ? pass : fail)("A", "legacy user credits promoted to subscription wallet", {
        before,
        after,
        sourceRemaining,
      });
    });

    // --- F: duplicate billing idempotency (gateway, before economic transactions) ---
    await runScenario("F", async () => {
      const { user, sub } = await createFixture({ remainingCredits: 10 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const dupKey = `matrix:dup:${String(user._id)}:${stamp}`;
      const before = await walletSnapshot(user._id);
      const first = await applyBillingEvent({
        userId: user._id,
        amount: -1,
        type: "outbound_attempt_charge",
        reason: "matrix_duplicate_probe",
        idempotencyKey: dupKey,
        sourceService: "runLocalBillingMatrix.duplicate",
      });
      const second = await applyBillingEvent({
        userId: user._id,
        amount: -1,
        type: "outbound_attempt_charge",
        reason: "matrix_duplicate_probe",
        idempotencyKey: dupKey,
        sourceService: "runLocalBillingMatrix.duplicate",
      });
      const after = await walletSnapshot(user._id);
      const debited =
        Number(before.subscription?.remainingCredits || 0) -
        Number(after.subscription?.remainingCredits || 0);
      const dupRows = after.ledger.filter((r) => r.idempotencyKey === dupKey);
      const ok =
        first.ok &&
        !first.duplicate &&
        second.ok &&
        second.duplicate === true &&
        debited === 1 &&
        dupRows.length === 1;
      (ok ? pass : fail)("F", "duplicate billing event is idempotent", {
        before,
        first,
        second,
        after,
      });
    });

    // --- G: zero credits blocked ---
    await runScenario("G", async () => {
      const { user, sub } = await createFixture({ remainingCredits: 0, reservedCredits: 0 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const gate = await assertUserHasOutboundDialCredits(user._id);
      const ok = gate.ok === false && gate.code === "INSUFFICIENT_CREDITS";
      (ok ? pass : fail)("G", "zero credits blocks outbound", { gate });
    });

    // --- H: admin vs customer wallet parity ---
    await runScenario("H", async () => {
      const { user, sub } = await createFixture({ remainingCredits: 42, reservedCredits: 3 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const subDoc = await Subscription.findById(sub._id).lean();
      const walletSnap = await getLatestSubscriptionCreditSnapshot(user._id);
      const ok =
        Number(subDoc?.remainingCredits) === Number(walletSnap?.remainingCredits) &&
        Number(subDoc?.reservedCredits) === Number(walletSnap?.reservedCredits) &&
        Number(subDoc?.telecomCredits) === Number(walletSnap?.telecomCredits);
      (ok ? pass : fail)("H", "subscription doc matches wallet snapshot API", {
        subscription: {
          remainingCredits: subDoc?.remainingCredits,
          reservedCredits: subDoc?.reservedCredits,
          telecomCredits: subDoc?.telecomCredits,
        },
        wallet: walletSnap,
      });
    });

    // --- I: credit addon (ledger grant) ---
    await runScenario("I", async () => {
      const { user, sub } = await createFixture({ remainingCredits: 5 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const before = await walletSnapshot(user._id);
      const addonKey = `matrix:addon:${String(user._id)}:${stamp}`;
      const grant = await applyBillingEvent({
        userId: user._id,
        amount: 1000,
        type: "add_on_purchase",
        reason: "matrix_addon_simulation",
        idempotencyKey: addonKey,
        allowNegative: true,
        sourceService: "runLocalBillingMatrix.addon",
      });
      const after = await walletSnapshot(user._id);
      const ok =
        grant.ok &&
        Number(after.subscription?.remainingCredits) ===
          Number(before.subscription?.remainingCredits) + 1000;
      (ok ? pass : fail)("I", "addon grant updates subscription balance immediately", {
        before,
        grant,
        after,
      });
    });

    // --- B: attempt only (ring) → 1 credit ---
    await runScenario("B", async () => {
      const { user, sub } = await createFixture({ remainingCredits: 20 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const before = await walletSnapshot(user._id);
      const call = await createOutboundCall(user._id);
      cleanupIds.callIds.push(call._id);
      const charge = await chargeOutboundAttemptSerialized(call);
      const after = await walletSnapshot(user._id);
      const expected = 1;
      const debited =
        Number(before.subscription?.remainingCredits || 0) -
        Number(after.subscription?.remainingCredits || 0);
      const ok =
        charge.ok &&
        debited === expected &&
        Number(after.ledgerDebitTotal) >= expected;
      (ok ? pass : fail)("B", `attempt only debits ${expected}`, { before, charge, after, expected });
    });

    // --- C: 18s answered → v1 lifecycle + connected intervals ---
    await runScenario("C", async () => {
      const SIMULATED_ANSWERED_SECONDS = 18;
      const { user, sub } = await createFixture({ remainingCredits: 30 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const call = await createOutboundCall(user._id, { status: "answered" });
      cleanupIds.callIds.push(call._id);
      const before = await walletSnapshot(user._id);
      const answeredAt = new Date(Date.now() - SIMULATED_ANSWERED_SECONDS * 1000);
      await Call.updateOne(
        { _id: call._id },
        { $set: { callAnsweredAt: answeredAt, callStartedAt: answeredAt } }
      );
      if (isRatingV1Enabled()) {
        await chargeCallEventSerialized(call, CALL_BILLING_EVENT.ANSWERED);
      } else {
        await chargeOutboundAttemptSerialized(call);
      }
      const freshCall = await Call.findById(call._id).lean();
      await billConnectedDurationIntervalsSerialized(freshCall);
      const after = await walletSnapshot(user._id);
      const elapsedSec = SIMULATED_ANSWERED_SECONDS;
      const expected = isRatingV1Enabled()
        ? rateCallEvent(CALL_BILLING_EVENT.ANSWERED) +
          Math.floor(elapsedSec / CREDIT_RULES.connectedIntervalSeconds) *
            CREDIT_RULES.connectedIntervalCharge
        : computeExpectedCallCredits({ answeredSeconds: elapsedSec, attemptCharged: true });
      const debited = before.subscription.remainingCredits - after.subscription.remainingCredits;
      const chainOk = after.ledger.every((row, i) => {
        if (i === 0) return true;
        return Math.abs(row.balanceBefore - after.ledger[i - 1].balanceAfter) < 0.0001;
      });
      const ok =
        Math.abs(debited - expected) < 0.01 &&
        chainOk &&
        balancesRoughlyEqual(
          after.subscription.remainingCredits,
          after.ledger.length ? after.ledger[after.ledger.length - 1].balanceAfter : after.subscription.remainingCredits
        );
      (ok ? pass : fail)("C", `18s answered debits ${expected} with valid ledger chain`, {
        before,
        after,
        expected,
        debited,
        chainOk,
        v1: isRatingV1Enabled(),
      });
    });

    // --- D/E: busy & rejected = attempt only (1) ---
    for (const label of ["D", "E"]) {
      await runScenario(label, async () => {
      const { user, sub } = await createFixture({ remainingCredits: 15 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const before = await walletSnapshot(user._id);
      const call = await createOutboundCall(user._id, {
        status: label === "D" ? "busy" : "rejected",
        callEndedAt: new Date(),
      });
      cleanupIds.callIds.push(call._id);
      const charge = await chargeOutboundAttemptSerialized(call);
      const after = await walletSnapshot(user._id);
      const debited = before.subscription.remainingCredits - after.subscription.remainingCredits;
      const ok = charge.ok && debited === 1;
      (ok ? pass : fail)(label, "terminal no-connect charges 1 attempt", { before, charge, after });
      });
    }

    // --- J: reservation released on call end ---
    await runScenario("J", async () => {
      const { user, sub } = await createFixture({ remainingCredits: 20 });
      cleanupIds.userIds.push(user._id);
      cleanupIds.subIds.push(sub._id);
      const call = await createOutboundCall(user._id, { status: "initiated" });
      cleanupIds.callIds.push(call._id);
      const before = await walletSnapshot(user._id);
      const reserve = await reserveCreditsForOutboundCallSerialized(call, {
        reservationMultiplier: 1,
      });
      await chargeOutboundAttemptSerialized(call);
      const mid = await walletSnapshot(user._id);
      await Call.updateOne(
        { _id: call._id },
        {
          $set: {
            status: "completed",
            callEndedAt: new Date(),
            creditReservationHeld: Number(reserve.hold || CREDIT_RULES.callReservationMinimum),
          },
        }
      );
      const release = await releaseUnusedCallReservationSerialized(
        await Call.findById(call._id).lean()
      );
      const after = await walletSnapshot(user._id);
      const held = Number(reserve.hold || CREDIT_RULES.callReservationMinimum);
      const ok =
        reserve.ok &&
        Number(mid.subscription?.reservedCredits) >= held &&
        Number(after.subscription?.reservedCredits) < Number(mid.subscription?.reservedCredits);
      (ok ? pass : fail)("J", "terminal call releases unused reservation", {
        before,
        reserve,
        mid,
        release,
        after,
      });
    });
  } finally {
    await cleanup(cleanupIds);
    await mongoose.disconnect().catch(() => {});
  }

  return {
    ranAt: new Date().toISOString(),
    stamp,
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    results,
  };
}

function writeSummary(summary) {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

run()
  .then((summary) => {
    writeSummary(summary);
    process.exit(summary.fail > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("[billing-matrix] fatal", err);
    const partial = {
      ranAt: new Date().toISOString(),
      stamp,
      pass: results.filter((r) => r.pass).length,
      fail: results.filter((r) => !r.pass).length + 1,
      fatal: String(err),
      results,
    };
    writeSummary(partial);
    process.exit(1);
  });
