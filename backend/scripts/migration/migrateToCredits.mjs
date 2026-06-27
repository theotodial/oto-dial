/**
 * Phase 6 — Telecom Credit data migration (idempotent, snapshot-backed, auto-rollback).
 *
 * For each user's latest subscription, reset the telecom balance to the new plan's credit grant
 * (Basic 1500 / Super 2500 / plan-defined), recorded as a `migration_reset` CreditLedger entry,
 * with reserved credits zeroed. Preserves status, renewal/billing cycle, Stripe IDs, purchased
 * numbers, team, and usage history. Re-running is a no-op (idempotent per subscription).
 *
 *   node scripts/migration/migrateToCredits.mjs [--no-rollback] [--snapshot <name>] [--dry-run]
 *
 * Flow: snapshot → reset balances → verify (strict) → auto-rollback on failure.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../../config/db.js";
import Subscription from "../../src/models/Subscription.js";
import User from "../../src/models/User.js";
import Plan from "../../src/models/Plan.js";
import CreditLedger from "../../src/models/CreditLedger.js";
import {
  createSnapshot,
  restoreSnapshot,
} from "../../src/services/migration/migrationSnapshotService.js";
import { resolvePlanCreditGrant } from "../../src/services/migration/migrationCreditGrant.js";
import { runMigrationVerification } from "../../src/services/migration/migrationVerifyService.js";
import { getLatestSubscription } from "../../src/services/subscriptionService.js";
import User from "../../src/models/User.js";

dotenv.config();

const DEFAULT_SNAPSHOT = "telecom-credit-migration-v1";

function round4(v) {
  return Math.round((Number(v) || 0) * 10000) / 10000;
}

/**
 * Idempotent reset of one subscription's balance to its plan grant.
 * Returns { migrated, skipped, grant }.
 */
async function migrateOneSubscription(sub, { dryRun }) {
  const key = `migration-v1:${String(sub._id)}`;
  const existing = await CreditLedger.findOne({ idempotencyKey: key }).select("_id").lean();
  if (existing) {
    return { migrated: false, skipped: true, reason: "already_migrated" };
  }

  const plan = sub.planId ? await Plan.findById(sub.planId).lean().catch(() => null) : null;

  // Preserve unlimited subscribers: their plan grants no finite credit allowance, and the app
  // bypasses credit deduction for them. Resetting their balance to a finite number would silently
  // turn "unlimited" into a capped balance — a breaking change. Leave them entirely untouched.
  const unlimited = Boolean(plan?.displayUnlimited || sub.displayUnlimited);
  if (unlimited) {
    return { migrated: false, skipped: true, reason: "unlimited_preserved" };
  }

  const grant = round4(resolvePlanCreditGrant(sub, plan));
  const before = round4(sub.remainingCredits || 0);

  // Only reset balances for plans that actually grant telecom credits (Basic/Super/etc.).
  // For 0-grant plans (e.g. SMS campaign, unmapped legacy) we must NOT zero an existing balance,
  // which could wipe legitimately purchased add-on credits.
  if (!(grant > 0)) {
    return { migrated: false, skipped: true, reason: "no_positive_grant", grant, before };
  }

  if (dryRun) {
    return { migrated: false, skipped: false, dryRun: true, grant, before };
  }

  // Audit ledger row (idempotency authority). Unique index on idempotencyKey guards re-runs/races.
  try {
    await CreditLedger.create([
      {
        user: sub.userId,
        amount: round4(grant - before),
        type: "migration_reset",
        balanceBefore: before,
        balanceAfter: grant,
        reason: "telecom_credit_migration_v1_reset_to_plan_grant",
        metadata: {
          subscriptionId: String(sub._id),
          planId: sub.planId ? String(sub.planId) : null,
          planName: plan?.name || sub.planName || null,
          grant,
          previousRemainingCredits: before,
        },
        idempotencyKey: key,
        createdAt: new Date(),
      },
    ]);
  } catch (err) {
    if (err?.code === 11000) {
      return { migrated: false, skipped: true, reason: "ledger_race" };
    }
    throw err;
  }

  // Reset authoritative subscription balance + zero reservation, preserve everything else.
  await Subscription.updateOne(
    { _id: sub._id },
    {
      $set: {
        remainingCredits: grant,
        telecomCredits: grant,
        reservedCredits: 0,
      },
    }
  );

  // Mirror cache on User (best-effort; reconciled by billing gateway thereafter).
  await User.updateOne(
    { _id: sub.userId },
    { $set: { remainingCredits: grant, reservedCredits: 0 } }
  ).catch(() => {});

  return { migrated: true, skipped: false, grant, before };
}

async function run() {
  const args = process.argv.slice(2);
  const noRollback = args.includes("--no-rollback");
  const dryRun = args.includes("--dry-run");
  const snapIdx = args.indexOf("--snapshot");
  const snapshotName = snapIdx >= 0 ? args[snapIdx + 1] : DEFAULT_SNAPSHOT;

  await connectDB();
  console.log(`[migrateToCredits] connected. snapshot='${snapshotName}' dryRun=${dryRun} rollback=${!noRollback}`);

  // 1) Snapshot (idempotent).
  if (!dryRun) {
    await createSnapshot({ snapshotName, log: (m) => console.log(m) });
  } else {
    console.log("[migrateToCredits] dry-run: skipping snapshot creation");
  }

  // 2) Reset balances — one authoritative subscription per user (active Stripe-linked first).
  const latestByUser = new Map();
  for await (const user of User.find({}).select("_id").lean().cursor()) {
    const sub = await getLatestSubscription(user._id);
    if (sub) latestByUser.set(String(user._id), sub);
  }

  let migrated = 0;
  let skipped = 0;
  let wouldMigrate = 0;
  let scanned = 0;
  const skipReasons = {};
  for (const sub of latestByUser.values()) {
    scanned += 1;
    try {
      const result = await migrateOneSubscription(sub, { dryRun });
      if (result.migrated) migrated += 1;
      else if (result.dryRun) wouldMigrate += 1;
      else if (result.skipped) {
        skipped += 1;
        skipReasons[result.reason || "unknown"] =
          (skipReasons[result.reason || "unknown"] || 0) + 1;
      }
    } catch (err) {
      console.error(`[migrateToCredits] failed on subscription ${sub._id}:`, err?.message || err);
      if (!dryRun && !noRollback) {
        console.error("[migrateToCredits] error during migration — rolling back snapshot.");
        await restoreSnapshot({ snapshotName, log: (m) => console.log(m) });
      }
      throw err;
    }
    if (scanned % 200 === 0) console.log("[migrateToCredits] progress", { scanned, migrated, skipped });
  }

  console.log("[migrateToCredits] reset complete", {
    users: latestByUser.size,
    migrated,
    wouldMigrate,
    skipped,
    skipReasons,
  });

  if (dryRun) {
    console.log(
      `[migrateToCredits] dry-run done (no writes). Would reset ${wouldMigrate} subscription(s); skipped ${skipped}.`,
      skipReasons
    );
    await mongoose.disconnect();
    return;
  }

  // 3) Verify (strict). Auto-rollback on failure.
  console.log("[migrateToCredits] running verification (strict grants)...");
  const verification = await runMigrationVerification({ snapshotName, strictGrants: true });
  console.log("[migrateToCredits] verification summary:", JSON.stringify(verification.summary, null, 2));
  if (verification.warnings.length) {
    console.warn("[migrateToCredits] warnings:");
    verification.warnings.forEach((w) => console.warn("  ⚠️  " + w));
  }

  if (!verification.ok) {
    console.error(`[migrateToCredits] verification FAILED (${verification.failures.length} issues):`);
    verification.failures.forEach((f) => console.error("  ❌ " + f));
    if (!noRollback) {
      console.error("[migrateToCredits] auto-rolling back to snapshot...");
      await restoreSnapshot({ snapshotName, log: (m) => console.log(m) });
      console.error("[migrateToCredits] rollback complete. Migration aborted.");
    } else {
      console.error("[migrateToCredits] --no-rollback set; leaving migrated state in place for inspection.");
    }
    await mongoose.disconnect();
    process.exit(1);
    return;
  }

  console.log("[migrateToCredits] ✅ migration verified successfully.");
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[migrateToCredits] FATAL", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
