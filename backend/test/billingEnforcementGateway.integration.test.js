/**
 * Opt-in Mongo-backed tests for applyBillingEvent.
 *
 * Run: BILLING_GATEWAY_INTEGRATION_TEST=1 MONGODB_URI=mongodb://127.0.0.1:27017/your-db npm test
 *
 * Skips by default so CI and local runs without Mongo stay green.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import CreditLedger from "../src/models/CreditLedger.js";
import BillingEventJournal from "../src/models/BillingEventJournal.js";
import { applyBillingEvent } from "../src/services/billingEnforcementGateway.js";
import { CREDIT_RULES } from "../src/config/creditConfig.js";

const URI = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const ENABLED = process.env.BILLING_GATEWAY_INTEGRATION_TEST === "1" && Boolean(URI);

if (!ENABLED) {
  test(
    "applyBillingEvent Mongo integration (skipped — set BILLING_GATEWAY_INTEGRATION_TEST=1 and MONGODB_URI)",
    { skip: true },
    () => {}
  );
} else {
  test("applyBillingEvent Mongo integration: duplicate + insufficient credits", async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(URI, {
        serverSelectionTimeoutMS: 15_000,
        connectTimeoutMS: 15_000,
      });
    }

    const stamp = Date.now();
    const keys = [];
    const userIds = [];

    try {
      // --- Duplicate idempotency: second call must not change balance ---
      const emailA = `billing-int-dup-${stamp}@example.test`;
      const userA = await User.create({
        email: emailA,
        password: "integration-test-password-placeholder",
        remainingCredits: 50,
        totalCreditsUsed: 0,
        reservedCredits: 0,
        lifetimeCreditsPurchased: 0,
      });
      userIds.push(userA._id);
      const dupKey = `integration:test:${String(userA._id)}:dup`;
      keys.push(dupKey);

      const r1 = await applyBillingEvent({
        userId: userA._id,
        amount: 7,
        type: "admin_adjustment",
        reason: "integration_duplicate_test",
        idempotencyKey: dupKey,
        allowNegative: true,
        sourceService: "test.integration.duplicate_first",
      });
      assert.equal(r1.ok, true);
      assert.equal(r1.duplicate, false);

      const j1 = await BillingEventJournal.find({ eventId: dupKey }).lean();
      assert.equal(j1.length, 1, "journal mirrors first successful post");

      const afterFirst = await User.findById(userA._id).lean();
      assert.equal(Number(afterFirst.remainingCredits), 57);

      const r2 = await applyBillingEvent({
        userId: userA._id,
        amount: 999,
        type: "admin_adjustment",
        reason: "should_not_apply",
        idempotencyKey: dupKey,
        allowNegative: true,
        sourceService: "test.integration.duplicate_second",
      });
      assert.equal(r2.ok, true);
      assert.equal(r2.duplicate, true);

      const j2 = await BillingEventJournal.find({ eventId: dupKey }).lean();
      assert.equal(j2.length, 1, "duplicate apply must not append second journal row");

      const afterSecond = await User.findById(userA._id).lean();
      assert.equal(
        Number(afterSecond.remainingCredits),
        57,
        "duplicate idempotency must not apply a second amount"
      );

      // --- Insufficient credits ---
      const emailB = `billing-int-ins-${stamp}@example.test`;
      const userB = await User.create({
        email: emailB,
        password: "integration-test-password-placeholder",
        remainingCredits: 2,
        totalCreditsUsed: 0,
        reservedCredits: 0,
        lifetimeCreditsPurchased: 0,
      });
      userIds.push(userB._id);
      const insKey = `integration:test:${String(userB._id)}:insufficient`;
      keys.push(insKey);

      const charge = Math.max(1, Number(CREDIT_RULES.outboundAttemptCharge || 1));
      const ins = await applyBillingEvent({
        userId: userB._id,
        amount: -charge,
        type: "outbound_attempt_charge",
        reason: "integration_insufficient_test",
        idempotencyKey: insKey,
        allowNegative: false,
        sourceService: "test.integration.insufficient",
      });
      assert.equal(ins.ok, false);
      assert.equal(ins.code, "INSUFFICIENT_CREDITS");

      const still = await CreditLedger.findOne({ idempotencyKey: insKey }).lean();
      assert.equal(still, null, "no ledger row on insufficient path");

      const stillJournal = await BillingEventJournal.findOne({ eventId: insKey }).lean();
      assert.equal(stillJournal, null, "no journal row on insufficient path");

      const userBAfter = await User.findById(userB._id).lean();
      assert.equal(Number(userBAfter.remainingCredits), 2, "balance unchanged on reject");
    } finally {
      await CreditLedger.deleteMany({ idempotencyKey: { $in: keys } }).catch(() => {});
      await BillingEventJournal.deleteMany({ eventId: { $in: keys } }).catch(() => {});
      if (userIds.length) {
        await User.deleteMany({ _id: { $in: userIds } }).catch(() => {});
      }
      await mongoose.disconnect().catch(() => {});
    }
  });
}
