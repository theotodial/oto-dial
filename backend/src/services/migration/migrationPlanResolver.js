/**
 * Authoritative plan resolution for migrated telecom-credit subscriptions.
 *
 * Evidence order (never default to Basic when stronger evidence exists):
 *   1. Active Stripe price ID on the subscription
 *   2. Stripe subscription metadata planId / planName
 *   3. Migration snapshot subscription document
 *   4. Existing Mongo subscription plan fields
 */

import Plan from "../../models/Plan.js";
import MigrationSnapshot from "../../models/MigrationSnapshot.js";
import { getCanonicalPlanKeyFromPriceId } from "../../config/stripeCatalog.js";
import { resolvePlanCreditGrant } from "./migrationCreditGrant.js";
import { applyPlanSnapshotToSubscription } from "../subscriptionPlanSnapshotService.js";
import { getLatestSubscription } from "../subscriptionService.js";

const ACTIVE_STATUSES = new Set(["active", "past_due", "pending_activation"]);

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function planFamily(plan) {
  if (!plan) return "unknown";
  const type = normalize(plan.type || plan.planType);
  const name = normalize(plan.name || plan.planName);
  if (plan.displayUnlimited || type.includes("unlimited") || name.includes("unlimited")) {
    return "unlimited";
  }
  if (plan.smsCampaignPlan || type.includes("sms") || name.includes("sms")) {
    return "sms_campaign";
  }
  if (type === "super" || name.includes("super")) return "super";
  if (type === "basic" || name.includes("basic")) return "basic";
  return type || name || "unknown";
}

async function loadPlan(planId, cache) {
  if (!planId) return null;
  const key = String(planId);
  if (cache.has(key)) return cache.get(key);
  const plan = await Plan.findById(planId).lean().catch(() => null);
  cache.set(key, plan);
  return plan;
}

async function resolvePlanByStripePriceId(stripePriceId, cache) {
  if (!stripePriceId) return null;
  const byPrice = await Plan.findOne({ stripePriceId, active: true }).lean();
  if (byPrice) return byPrice;

  const canonicalKey = getCanonicalPlanKeyFromPriceId(stripePriceId);
  if (canonicalKey === "super") {
    return Plan.findOne({ $or: [{ type: "super" }, { name: /super/i }], active: true }).lean();
  }
  if (canonicalKey === "basic") {
    return Plan.findOne({ $or: [{ type: "basic" }, { name: /basic/i }], active: true }).lean();
  }
  if (canonicalKey) {
    const byType = await Plan.findOne({ type: canonicalKey, active: true }).lean();
    if (byType) return byType;
  }
  return null;
}

async function loadSnapshotSubscription(subscriptionId, snapshotName) {
  const row = await MigrationSnapshot.findOne({
    snapshotName,
    collectionName: "subscriptions",
    documentId: subscriptionId,
  })
    .select("data")
    .lean();
  return row?.data || null;
}

/**
 * Resolve the plan a subscription should be on.
 *
 * @returns {Promise<{ plan: object|null, source: string, canonicalKey: string|null }>}
 */
export async function resolveAuthoritativePlanForSubscription(subscription, options = {}) {
  const cache = options.planCache || new Map();
  const snapshotName = options.snapshotName || "telecom-credit-migration-v1";

  if (subscription?.stripePriceId) {
    const plan = await resolvePlanByStripePriceId(subscription.stripePriceId, cache);
    if (plan) {
      return {
        plan,
        source: "stripe_price_id",
        canonicalKey: getCanonicalPlanKeyFromPriceId(subscription.stripePriceId),
      };
    }
  }

  const snap = await loadSnapshotSubscription(subscription?._id, snapshotName);
  if (snap?.stripePriceId && snap.stripePriceId !== subscription?.stripePriceId) {
    const plan = await resolvePlanByStripePriceId(snap.stripePriceId, cache);
    if (plan) {
      return {
        plan,
        source: "migration_snapshot_stripe_price",
        canonicalKey: getCanonicalPlanKeyFromPriceId(snap.stripePriceId),
      };
    }
  }
  if (snap?.planId) {
    const plan = await loadPlan(snap.planId, cache);
    if (plan) {
      return { plan, source: "migration_snapshot_plan_id", canonicalKey: planFamily(plan) };
    }
  }

  if (subscription?.planId) {
    const plan = await loadPlan(subscription.planId, cache);
    if (plan) {
      return {
        plan,
        source: "subscription_plan_id",
        canonicalKey: getCanonicalPlanKeyFromPriceId(subscription.stripePriceId) || planFamily(plan),
      };
    }
  }

  const nameKey = normalize(subscription?.planName || subscription?.planType || subscription?.planKey);
  if (nameKey.includes("super")) {
    const plan = await Plan.findOne({ name: /super/i, active: true }).lean();
    if (plan) return { plan, source: "subscription_name_super", canonicalKey: "super" };
  }
  if (nameKey.includes("basic")) {
    const plan = await Plan.findOne({ name: /basic/i, active: true }).lean();
    if (plan) return { plan, source: "subscription_name_basic", canonicalKey: "basic" };
  }

  return { plan: null, source: "unresolved", canonicalKey: null };
}

function describeMismatch(subscription, currentPlan, authoritative) {
  const currentFamily = planFamily(currentPlan);
  const targetFamily = planFamily(authoritative.plan);
  if (!authoritative.plan) return null;
  if (String(subscription.planId || "") === String(authoritative.plan._id)) return null;
  if (currentFamily === targetFamily && currentFamily !== "unknown") return null;
  return {
    subscriptionId: String(subscription._id),
    userId: String(subscription.userId),
    status: subscription.status,
    stripePriceId: subscription.stripePriceId || null,
    currentPlanId: subscription.planId ? String(subscription.planId) : null,
    currentPlanName: currentPlan?.name || subscription.planName || null,
    currentFamily,
    targetPlanId: String(authoritative.plan._id),
    targetPlanName: authoritative.plan.name,
    targetFamily,
    evidenceSource: authoritative.source,
    currentGrant: resolvePlanCreditGrant(subscription, currentPlan),
    targetGrant: resolvePlanCreditGrant(
      { ...subscription, stripePriceId: subscription.stripePriceId || authoritative.plan.stripePriceId },
      authoritative.plan
    ),
  };
}

/**
 * Audit all users' authoritative subscriptions for plan / grant mismatches.
 */
export async function auditMigrationPlanMappings(options = {}) {
  const snapshotName = options.snapshotName || "telecom-credit-migration-v1";
  const userIds = options.userIds || null;
  const planCache = new Map();

  const query = userIds?.length ? { _id: { $in: userIds } } : {};
  const users = await (await import("../../models/User.js")).default.find(query).select("_id email").lean();

  const summary = {
    usersScanned: 0,
    basicUsers: 0,
    superUsers: 0,
    unlimitedUsers: 0,
    smsCampaignUsers: 0,
    incorrectlyMappedUsers: 0,
    correctedUsers: 0,
    manualReview: 0,
    mismatches: [],
    unresolved: [],
  };

  for (const user of users) {
    summary.usersScanned += 1;
    const subscription = await getLatestSubscription(user._id);
    if (!subscription) continue;

    const currentPlan = await loadPlan(subscription.planId, planCache);
    const authoritative = await resolveAuthoritativePlanForSubscription(subscription, {
      snapshotName,
      planCache,
    });
    const family = planFamily(authoritative.plan || currentPlan);
    if (family === "basic") summary.basicUsers += 1;
    else if (family === "super") summary.superUsers += 1;
    else if (family === "unlimited") summary.unlimitedUsers += 1;
    else if (family === "sms_campaign") summary.smsCampaignUsers += 1;

    const mismatch = describeMismatch(subscription, currentPlan, authoritative);
    if (mismatch) {
      summary.incorrectlyMappedUsers += 1;
      summary.mismatches.push({ ...mismatch, email: user.email || null });
      if (!authoritative.plan) summary.unresolved.push(mismatch);
    }
  }

  return summary;
}

/**
 * Repair one subscription's plan mapping from authoritative evidence.
 */
export async function repairSubscriptionPlanMapping(subscription, options = {}) {
  const snapshotName = options.snapshotName || "telecom-credit-migration-v1";
  const dryRun = Boolean(options.dryRun);
  const planCache = options.planCache || new Map();

  const currentPlan = await loadPlan(subscription.planId, planCache);
  const authoritative = await resolveAuthoritativePlanForSubscription(subscription, {
    snapshotName,
    planCache,
  });
  const mismatch = describeMismatch(subscription, currentPlan, authoritative);
  if (!mismatch) {
    return { repaired: false, skipped: true, reason: "already_correct" };
  }
  if (!authoritative.plan) {
    return { repaired: false, skipped: true, reason: "unresolved", mismatch };
  }

  if (dryRun) {
    return { repaired: false, dryRun: true, mismatch, authoritative };
  }

  const subDoc = await (await import("../../models/Subscription.js")).default.findById(subscription._id);
  if (!subDoc) return { repaired: false, skipped: true, reason: "subscription_not_found" };

  subDoc.planId = authoritative.plan._id;
  subDoc.stripePriceId = subscription.stripePriceId || authoritative.plan.stripePriceId || subDoc.stripePriceId;
  applyPlanSnapshotToSubscription(subDoc, authoritative.plan);
  await subDoc.save();

  const User = (await import("../../models/User.js")).default;
  if (ACTIVE_STATUSES.has(String(subDoc.status))) {
    await User.updateOne(
      { _id: subDoc.userId },
      {
        $set: {
          currentPlanId: authoritative.plan._id,
          activeSubscriptionId: subDoc._id,
          lastSubscriptionSyncAt: new Date(),
        },
      }
    ).catch(() => {});
  }

  return { repaired: true, mismatch, authoritative };
}

/**
 * Batch repair for all mismatched subscriptions.
 */
export async function repairAllMigrationPlanMappings(options = {}) {
  const audit = await auditMigrationPlanMappings(options);
  const results = [];
  for (const mismatch of audit.mismatches) {
    const subscription = await (await import("../../models/Subscription.js")).default
      .findById(mismatch.subscriptionId)
      .lean();
    if (!subscription) {
      results.push({ subscriptionId: mismatch.subscriptionId, repaired: false, reason: "not_found" });
      continue;
    }
    try {
      const result = await repairSubscriptionPlanMapping(subscription, options);
      results.push({ subscriptionId: mismatch.subscriptionId, ...result });
      if (result.repaired) audit.correctedUsers += 1;
      else if (result.reason === "unresolved") audit.manualReview += 1;
    } catch (err) {
      results.push({
        subscriptionId: mismatch.subscriptionId,
        repaired: false,
        error: err?.message || String(err),
      });
      audit.manualReview += 1;
    }
  }
  return { audit, results };
}
