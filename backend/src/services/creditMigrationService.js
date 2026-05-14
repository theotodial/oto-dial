import User from "../models/User.js";
import CreditLedger from "../models/CreditLedger.js";
import { applyBillingEvent, syncCachedRemainingCreditsIfUnset } from "./billingEnforcementGateway.js";

function buildMigrationKey(userId) {
  return `migration:${String(userId)}`;
}

export async function migrateUserMinutesToCredits(user) {
  if (!user?._id) return { ok: false, reason: "missing_user" };

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
  const user = await User.findById(userId)
    .select("remainingMinutes remainingCredits totalCreditsUsed reservedCredits lifetimeCreditsPurchased")
    .lean();
  if (!user) return { ok: false, reason: "user_not_found" };
  return migrateUserMinutesToCredits(user);
}
