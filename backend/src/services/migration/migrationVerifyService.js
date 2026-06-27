/**
 * Telecom Credit migration verification.
 *
 * Read-only assertions that gate switching production authority. Returns a structured result;
 * callers (verify.mjs, migrateToCredits.mjs auto-rollback) decide what to do on failure.
 */

import mongoose from "mongoose";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import Plan from "../../models/Plan.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import CreditLedger from "../../models/CreditLedger.js";
import MigrationSnapshot from "../../models/MigrationSnapshot.js";
import { MANIFEST_COLLECTION } from "./migrationSnapshotService.js";
import { resolvePlanCreditGrant } from "./migrationCreditGrant.js";
import {
  rateCallEvent,
  rateConnectedSeconds,
  rateSms,
  CALL_BILLING_EVENT,
} from "../telecomRatingEngine.js";

const ACTIVE_STATUSES = new Set(["active", "past_due", "pending_activation"]);

function approxEqual(a, b, eps = 0.0001) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.snapshotName] - to compare phone-number baselines
 * @param {boolean} [opts.strictGrants] - assert migrated subs equal their plan grant (use right after migration)
 * @returns {Promise<{ ok: boolean, failures: string[], warnings: string[], summary: object }>}
 */
export async function runMigrationVerification(opts = {}) {
  const { snapshotName = "telecom-credit-migration-v1", strictGrants = false } = opts;
  const failures = [];
  const warnings = [];

  // ---- Rating spot checks (the v1 table must be active) ----
  if (rateCallEvent(CALL_BILLING_EVENT.ANSWERED) !== 5) {
    failures.push(`rateCallEvent(answered) expected 5, got ${rateCallEvent(CALL_BILLING_EVENT.ANSWERED)}`);
  }
  if (rateCallEvent(CALL_BILLING_EVENT.RINGING) !== 4) {
    failures.push(`rateCallEvent(ringing) expected 4, got ${rateCallEvent(CALL_BILLING_EVENT.RINGING)}`);
  }
  if (rateCallEvent(CALL_BILLING_EVENT.ROUTED) !== 2) {
    failures.push(`rateCallEvent(routed) expected 2, got ${rateCallEvent(CALL_BILLING_EVENT.ROUTED)}`);
  }
  if (!approxEqual(rateConnectedSeconds(60), 15)) {
    failures.push(`rateConnectedSeconds(60) expected 15 (0.25/s), got ${rateConnectedSeconds(60)}`);
  }
  if (rateSms({ encoding: "GSM", segments: 1 }) !== 15) {
    failures.push(`rateSms(GSM,1) expected 15, got ${rateSms({ encoding: "GSM", segments: 1 })}`);
  }
  if (rateSms({ encoding: "UNICODE", segments: 1 }) !== 20) {
    failures.push(`rateSms(UNICODE,1) expected 20, got ${rateSms({ encoding: "UNICODE", segments: 1 })}`);
  }

  // ---- Subscriptions: balances, plan mapping, grants ----
  const subs = await Subscription.find({}).lean();
  let negativeBalances = 0;
  let orphanSubscriptions = 0;
  let migratedCount = 0;
  let grantMismatches = 0;

  const planCache = new Map();
  const getPlan = async (planId) => {
    if (!planId) return null;
    const key = String(planId);
    if (planCache.has(key)) return planCache.get(key);
    const plan = await Plan.findById(planId).lean().catch(() => null);
    planCache.set(key, plan);
    return plan;
  };

  // Detect duplicate active subscriptions per user.
  const activeByUser = new Map();

  for (const sub of subs) {
    if (Number(sub.remainingCredits || 0) < -0.0001) {
      negativeBalances += 1;
      failures.push(`Subscription ${sub._id} has negative remainingCredits (${sub.remainingCredits}).`);
    }

    if (sub.planId) {
      const plan = await getPlan(sub.planId);
      if (!plan) {
        orphanSubscriptions += 1;
        failures.push(`Subscription ${sub._id} references missing plan ${sub.planId} (orphan).`);
      }
    }

    if (ACTIVE_STATUSES.has(String(sub.status))) {
      const arr = activeByUser.get(String(sub.userId)) || [];
      arr.push(String(sub._id));
      activeByUser.set(String(sub.userId), arr);
    }

    // Was this subscription migrated by the v1 reset?
    const migratedLedger = await CreditLedger.findOne({
      idempotencyKey: `migration-v1:${String(sub._id)}`,
    })
      .select("_id balanceAfter")
      .lean();
    if (migratedLedger) {
      migratedCount += 1;
      if (strictGrants) {
        const plan = await getPlan(sub.planId);
        const grant = resolvePlanCreditGrant(sub, plan);
        if (!approxEqual(sub.remainingCredits, grant)) {
          grantMismatches += 1;
          failures.push(
            `Migrated subscription ${sub._id} remainingCredits (${sub.remainingCredits}) != plan grant (${grant}).`
          );
        }
        if (Number(sub.reservedCredits || 0) !== 0) {
          failures.push(
            `Migrated subscription ${sub._id} reservedCredits not zeroed (${sub.reservedCredits}).`
          );
        }
      }
    }
  }

  let duplicateActiveSubscriptions = 0;
  for (const [userId, ids] of activeByUser.entries()) {
    if (ids.length > 1) {
      duplicateActiveSubscriptions += 1;
      failures.push(`User ${userId} has ${ids.length} active subscriptions: ${ids.join(", ")}.`);
    }
  }

  // ---- Users: negative cache balances ----
  const negativeUsers = await User.countDocuments({ remainingCredits: { $lt: -0.0001 } });
  if (negativeUsers > 0) {
    failures.push(`${negativeUsers} users have negative remainingCredits cache.`);
  }

  // ---- Phone numbers: no purchased number lost its owner ----
  const phoneNumbersTotalNow = await PhoneNumber.countDocuments({});
  const phoneNumbersAssignedNow = await PhoneNumber.countDocuments({
    userId: { $ne: null, $exists: true },
  });
  const manifestRow = await MigrationSnapshot.findOne({
    snapshotName,
    collectionName: MANIFEST_COLLECTION,
  }).lean();
  const baseline = manifestRow?.data?.phoneNumbers || null;
  if (baseline) {
    if (phoneNumbersAssignedNow < baseline.assigned) {
      warnings.push(
        `[manual review] Assigned phone numbers dropped since snapshot: baseline ${baseline.assigned} → now ${phoneNumbersAssignedNow}. Migration does not modify phone ownership.`
      );
    }
    if (phoneNumbersTotalNow < baseline.total) {
      warnings.push(
        `[historical] Total phone numbers decreased since snapshot: baseline ${baseline.total} → now ${phoneNumbersTotalNow}.`
      );
    }
  } else {
    warnings.push(`No snapshot baseline '${snapshotName}' for phone-number comparison.`);
  }

  // ---- Stripe mapping presence for purchasable plans ----
  // Free plans (price 0) and trial plans never go through Stripe checkout, so they are exempt.
  const purchasableMissingStripe = await Plan.countDocuments({
    active: true,
    adminOnly: { $ne: true },
    comingSoon: { $ne: true },
    type: { $ne: "trial" },
    price: { $gt: 0 },
    $or: [{ stripePriceId: { $in: [null, ""] } }],
  });
  if (purchasableMissingStripe > 0) {
    failures.push(`${purchasableMissingStripe} purchasable plans are missing a Stripe price.`);
  }

  const summary = {
    subscriptions: subs.length,
    migratedCount,
    negativeBalances,
    negativeUsers,
    orphanSubscriptions,
    duplicateActiveSubscriptions,
    grantMismatches,
    phoneNumbers: {
      baseline,
      now: { total: phoneNumbersTotalNow, assigned: phoneNumbersAssignedNow },
    },
    purchasableMissingStripe,
    mongoConnected: mongoose.connection.readyState === 1,
  };

  return { ok: failures.length === 0, failures, warnings, summary };
}
