import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import CreditLedger from "../models/CreditLedger.js";
import { applyBillingEvent, syncCachedRemainingCreditsIfUnset } from "./billingEnforcementGateway.js";
import { isRatingV1Enabled } from "./telecomRatingEngine.js";

function buildMigrationKey(userId) {
  return `migration:${String(userId)}`;
}

export async function migrateUserMinutesToCredits(user) {
  if (!user?._id) return { ok: false, reason: "missing_user" };
  // Neutralized under v1: balances are set by the snapshot-backed reset migration
  // (migrateToCredits.mjs), not by lazy 1:1 minute→credit conversion.
  if (isRatingV1Enabled()) {
    return { ok: true, skipped: true, reason: "v1_reset_migration_authoritative" };
  }

  const hasCredits = Number.isFinite(Number(user.remainingCredits));
  const existingMinutes = Math.max(0, Number(user.remainingMinutes || 0));
  if (hasCredits && Number(user.remainingCredits) > 0) {
    return { ok: true, skipped: true, reason: "already_migrated" };
  }

  const idempotencyKey = buildMigrationKey(user._id);
  const existing = await CreditLedger.findOne({ idempotencyKey }).lean();
  if (existing) {
    if (!hasCredits) {
      await syncCachedRemainingCreditsIfUnset({
        userId: user._id,
        balanceAfter: existing.balanceAfter,
        sourceService: "creditMigrationService.ledger_exists_backfill",
      });
    }
    return { ok: true, skipped: true, reason: "ledger_exists" };
  }

  if (existingMinutes <= 0) {
    await syncCachedRemainingCreditsIfUnset({
      userId: user._id,
      balanceAfter: 0,
      sourceService: "creditMigrationService.no_legacy_minutes",
    });
    return { ok: true, skipped: true, reason: "no_legacy_minutes" };
  }

  const posted = await applyBillingEvent({
    userId: user._id,
    amount: existingMinutes,
    type: "migration_conversion",
    reason: "remainingMinutes_to_remainingCredits",
    metadata: { sourceField: "remainingMinutes", sourceAmount: existingMinutes },
    idempotencyKey,
    allowNegative: true,
    sourceService: "creditMigrationService.migrateUserMinutesToCredits",
  });

  return { ok: Boolean(posted?.ok), skipped: false, migratedAmount: existingMinutes };
}

export async function lazyMigrateUserById(userId) {
  // Neutralized under v1 (see migrateUserMinutesToCredits).
  if (isRatingV1Enabled()) {
    return { ok: true, skipped: true, reason: "v1_reset_migration_authoritative" };
  }
  const user = await User.findById(userId)
    .select("remainingMinutes remainingCredits totalCreditsUsed reservedCredits lifetimeCreditsPurchased")
    .lean();
  if (!user) return { ok: false, reason: "user_not_found" };
  const migrated = await migrateUserMinutesToCredits(user);
  const latestSub = await Subscription.findOne({ userId })
    .sort({ createdAt: -1 })
    .select("_id planId limits monthlyCreditsLimit telecomCredits remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased")
    .lean();
  if (latestSub?._id) {
    const plan = latestSub.planId
      ? await Plan.findById(latestSub.planId).select("monthlyCreditsLimit limits").lean()
      : null;
    const planCredits = Math.max(
      0,
      Number(
        latestSub.monthlyCreditsLimit ??
          plan?.monthlyCreditsLimit ??
          latestSub.limits?.creditsTotal ??
          plan?.limits?.creditsTotal ??
          latestSub.limits?.minutesTotal ??
          plan?.limits?.minutesTotal ??
          0
      )
    );
    const nextRemaining = Number.isFinite(Number(latestSub.remainingCredits))
      ? Number(latestSub.remainingCredits)
      : Math.max(planCredits, Number(user.remainingCredits || 0), 0);
    await Subscription.updateOne(
      { _id: latestSub._id },
      {
        $set: {
          telecomCredits: Math.max(
            planCredits,
            Number.isFinite(Number(latestSub.telecomCredits))
              ? Number(latestSub.telecomCredits)
              : nextRemaining
          ),
          remainingCredits: Math.max(0, nextRemaining),
          reservedCredits: Number(latestSub.reservedCredits || 0),
          totalCreditsUsed: Number(latestSub.totalCreditsUsed || 0),
          lifetimeCreditsPurchased: Number(latestSub.lifetimeCreditsPurchased || 0),
        },
      }
    );
  }
  return migrated;
}
