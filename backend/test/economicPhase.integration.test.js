/**
 * Opt-in Mongo-backed tests: reservation reconciliation, recovery idempotency, exposure reject.
 *
 * Run:
 *   ECONOMIC_PHASE_INTEGRATION_TEST=1 MONGODB_URI=mongodb://127.0.0.1:27017/your-db npm test
 *
 * Skips by default so CI and local runs without Mongo stay green.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Call from "../src/models/Call.js";
import EconomicTimeline from "../src/models/EconomicTimeline.js";
import CreditLedger from "../src/models/CreditLedger.js";
import BillingEventJournal from "../src/models/BillingEventJournal.js";
import { reconcileUserReservations } from "../src/services/reservationReconciliationService.js";
import { recoverActiveCallEconomics } from "../src/services/economicRecoveryService.js";
import { evaluateOutboundCreditExposure } from "../src/services/economicExposureGuard.js";
import { computeEconomicConsistencyHash } from "../src/services/economicSerializationService.js";

const URI = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const ENABLED = process.env.ECONOMIC_PHASE_INTEGRATION_TEST === "1" && Boolean(URI);

if (!ENABLED) {
  test(
    "economic phase Mongo integration (skipped — set ECONOMIC_PHASE_INTEGRATION_TEST=1 and MONGODB_URI)",
    { skip: true },
    () => {}
  );
} else {
  test("economic phase Mongo integration: reconciliation, recovery idempotency, exposure", async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(URI, {
        serverSelectionTimeoutMS: 15_000,
        connectTimeoutMS: 15_000,
      });
    }

    const stamp = Date.now();
    const suffix = String(stamp).slice(-8);
    const userIds = [];
    const callIds = [];

    try {
      // --- evaluateOutboundCreditExposure: thin wallet vs large new hold ---
      const userThin = await User.create({
        email: `econ-phase-thin-${stamp}@example.test`,
        password: "integration-test-password-placeholder",
        remainingCredits: 4,
        totalCreditsUsed: 0,
        reservedCredits: 0,
        lifetimeCreditsPurchased: 0,
      });
      userIds.push(userThin._id);
      const thinExp = await evaluateOutboundCreditExposure(userThin._id, { additionalReservation: 50 });
      assert.equal(thinExp.ok, false);
      assert.equal(thinExp.code, "INSUFFICIENT_PROJECTED_CREDITS");

      // --- reconcileUserReservations: drift when user reserved > sum of open timelines ---
      const userDrift = await User.create({
        email: `econ-phase-drift-${stamp}@example.test`,
        password: "integration-test-password-placeholder",
        remainingCredits: 500,
        totalCreditsUsed: 0,
        reservedCredits: 20,
        lifetimeCreditsPurchased: 0,
      });
      userIds.push(userDrift._id);
      const recDrift = await reconcileUserReservations(userDrift._id);
      assert.equal(recDrift.error, undefined);
      assert.equal(Number(recDrift.userReservedCredits), 20);
      assert.equal(Number(recDrift.timelineReservedCredits), 0);
      assert.equal(Number(recDrift.drift), 20);
      assert.equal(recDrift.healthy, false);

      // --- reconcileUserReservations: aligned user vs open timeline ---
      const userAligned = await User.create({
        email: `econ-phase-aligned-${stamp}@example.test`,
        password: "integration-test-password-placeholder",
        remainingCredits: 500,
        totalCreditsUsed: 0,
        reservedCredits: 7,
        lifetimeCreditsPurchased: 0,
      });
      userIds.push(userAligned._id);
      const callGhost = await Call.create({
        user: userAligned._id,
        phoneNumber: `+1555${suffix}0001`,
        fromNumber: `+1555${suffix}0002`,
        toNumber: `+1555${suffix}0003`,
        direction: "outbound",
        status: "completed",
        source: "webrtc",
      });
      callIds.push(callGhost._id);
      const tlRow = {
        user: userAligned._id,
        callId: callGhost._id,
        smsId: null,
        timelineId: `call:${String(callGhost._id)}`,
        economicVersion: 0,
        timelineState: "reserved",
        reservedCredits: 7,
        consumedCredits: 0,
        releasedCredits: 0,
        settledCredits: 0,
        billedIntervalIndexes: [],
        lastEconomicEventAt: new Date(),
        finalizedAt: null,
        metadata: { mutations: [], processedMutationIds: [] },
      };
      tlRow.consistencyHash = computeEconomicConsistencyHash(tlRow);
      const [tlCreated] = await EconomicTimeline.create([tlRow]);
      assert.ok(tlCreated?._id);

      const recOk = await reconcileUserReservations(userAligned._id);
      assert.equal(recOk.healthy, true);
      assert.equal(Number(recOk.drift), 0);

      // --- recoverActiveCallEconomics single: second run does not double-bill intervals ---
      const userCall = await User.create({
        email: `econ-phase-recovery-${stamp}@example.test`,
        password: "integration-test-password-placeholder",
        remainingCredits: 500,
        totalCreditsUsed: 0,
        reservedCredits: 0,
        lifetimeCreditsPurchased: 0,
      });
      userIds.push(userCall._id);
      const answeredAt = new Date(Date.now() - 25 * 1000);
      const liveCall = await Call.create({
        user: userCall._id,
        phoneNumber: `+1555${suffix}1001`,
        fromNumber: `+1555${suffix}1002`,
        toNumber: `+1555${suffix}1003`,
        direction: "outbound",
        status: "answered",
        source: "webrtc",
        callAnsweredAt: answeredAt,
        callStartedAt: answeredAt,
        durationCreditsCharged: 0,
      });
      callIds.push(liveCall._id);

      const first = await recoverActiveCallEconomics({ mode: "single", callId: String(liveCall._id) });
      assert.equal(first.processed, 1);
      const r1 = first.results[0]?.result;
      assert.ok(r1 && r1.ok !== false, "first billing batch should succeed");
      const charged1 = Number(r1.chargedNow || 0);
      assert.ok(charged1 >= 1, "expected at least one new interval billed for ~25s connected");

      const second = await recoverActiveCallEconomics({ mode: "single", callId: String(liveCall._id) });
      assert.equal(second.processed, 1);
      const r2 = second.results[0]?.result;
      assert.equal(Number(r2?.chargedNow || 0), 0, "replay must not charge same intervals again");

      const afterCall = await Call.findById(liveCall._id).lean();
      assert.ok(
        Number(afterCall?.durationCreditsCharged || 0) >= charged1,
        "call cursor should reflect billed intervals"
      );
    } finally {
      for (const cid of callIds) {
        await EconomicTimeline.deleteMany({ callId: cid }).catch(() => {});
        await Call.deleteOne({ _id: cid }).catch(() => {});
      }
      if (userIds.length) {
        await CreditLedger.deleteMany({ user: { $in: userIds } }).catch(() => {});
        await BillingEventJournal.deleteMany({ userId: { $in: userIds } }).catch(() => {});
        await User.deleteMany({ _id: { $in: userIds } }).catch(() => {});
      }
      await mongoose.disconnect().catch(() => {});
    }
  });
}
