/**
 * RC2 Priority 1 — complete per-subscriber plan audit.
 * Authority: Stripe price → Mongo subscription → Plan → credit grant → UI layers.
 */

import mongoose from "mongoose";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import Plan from "../../models/Plan.js";
import { getStripe } from "../../../config/stripe.js";
import { getCanonicalPlanKeyFromPriceId } from "../../config/stripeCatalog.js";
import { rebuildBalanceFromCreditLedger, balancesRoughlyEqual } from "../ledgerReconstructionService.js";
import { resolvePlanCreditGrant } from "../migration/migrationCreditGrant.js";
import {
  resolveAuthoritativePlanForSubscription,
  repairSubscriptionPlanMapping,
} from "../migration/migrationPlanResolver.js";
import { getLatestSubscription, loadUserSubscription } from "../subscriptionService.js";
import { normalizePlanFamilyKey } from "./productionAuditCommon.js";

function planFamily(plan) {
  const name = String(plan?.name || plan?.planName || "").toLowerCase();
  const type = String(plan?.type || plan?.planType || "").toLowerCase();
  if (plan?.displayUnlimited || name.includes("unlimited") || type.includes("unlimited")) return "unlimited";
  if (plan?.smsCampaignPlan || name.includes("sms") || type.includes("campaign")) return "sms_campaign";
  if (type === "super" || name.includes("super")) return "super";
  if (type === "basic" || name.includes("basic")) return "basic";
  return normalizePlanFamilyKey(type || name || "unknown");
}

function planFamiliesEquivalent(a, b) {
  return normalizePlanFamilyKey(a) === normalizePlanFamilyKey(b);
}

async function fetchStripeSubscription(stripeSubscriptionId) {
  const stripe = getStripe();
  if (!stripe || !stripeSubscriptionId) return null;
  try {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const priceId = sub?.items?.data?.[0]?.price?.id || null;
    return { id: sub.id, status: sub.status, priceId, customerId: sub.customer };
  } catch {
    return { error: "stripe_retrieve_failed", id: stripeSubscriptionId };
  }
}

async function auditOneUser(user, options = {}) {
  const planCache = options.planCache || new Map();
  const subscription = await getLatestSubscription(user._id);
  if (!subscription) {
    return { userId: String(user._id), email: user.email, skipped: true, reason: "no_subscription" };
  }

  const currentPlan = subscription.planId
    ? await Plan.findById(subscription.planId).lean().catch(() => null)
    : null;
  const authoritative = await resolveAuthoritativePlanForSubscription(subscription, {
    snapshotName: options.snapshotName,
    planCache,
  });

  const stripeLive = subscription.stripeSubscriptionId
    ? await fetchStripeSubscription(subscription.stripeSubscriptionId)
    : null;
  const stripePriceId = stripeLive?.priceId || subscription.stripePriceId || null;
  const stripeCanonical = stripePriceId ? getCanonicalPlanKeyFromPriceId(stripePriceId) : null;

  const [ledger, dashboard] = await Promise.all([
    rebuildBalanceFromCreditLedger(user._id),
    loadUserSubscription(user._id).catch(() => null),
  ]);

  const grant = resolvePlanCreditGrant(
    { ...subscription, stripePriceId: stripePriceId || subscription.stripePriceId },
    authoritative.plan || currentPlan
  );
  const subRemaining = Number(subscription.remainingCredits || 0);
  const userRemaining = Number(user.remainingCredits ?? 0);
  const ledgerTail = Number(ledger.balance || 0);
  const dashboardCredits = Number(dashboard?.creditsRemaining ?? dashboard?.remainingCredits ?? 0);

  const currentFamily = planFamily(currentPlan || subscription);
  const targetFamily = planFamily(authoritative.plan);
  const planMismatch =
    authoritative.plan &&
    String(authoritative.plan._id) !== String(subscription.planId || "") &&
    !planFamiliesEquivalent(currentFamily, targetFamily);

  const creditDrift = [];
  if (!balancesRoughlyEqual(subRemaining, userRemaining)) {
    creditDrift.push({ layer: "user_cache", value: userRemaining, expected: subRemaining });
  }
  if ((ledger.rowCount || 0) > 0 && !balancesRoughlyEqual(ledgerTail, subRemaining)) {
    creditDrift.push({ layer: "ledger_tail", value: ledgerTail, expected: subRemaining });
  }
  if (dashboard && !balancesRoughlyEqual(dashboardCredits, subRemaining)) {
    creditDrift.push({ layer: "dashboard", value: dashboardCredits, expected: subRemaining });
  }

  const stripeMongoMismatch =
    stripeCanonical &&
    authoritative.plan &&
    !planFamiliesEquivalent(stripeCanonical, planFamily(authoritative.plan)) &&
    stripeCanonical !== "unknown";

  return {
    userId: String(user._id),
    email: user.email || null,
    stripeCustomerId: user.stripeCustomerId || subscription.stripeCustomerId || stripeLive?.customerId || null,
    stripeSubscriptionId: subscription.stripeSubscriptionId || stripeLive?.id || null,
    stripePriceId,
    stripeCanonical,
    mongoSubscriptionId: String(subscription._id),
    mongoPlanId: subscription.planId ? String(subscription.planId) : null,
    mongoPlanName: currentPlan?.name || subscription.planName || null,
    authoritativePlanId: authoritative.plan ? String(authoritative.plan._id) : null,
    authoritativePlanName: authoritative.plan?.name || null,
    evidenceSource: authoritative.source,
    family: targetFamily || currentFamily,
    monthlyCreditGrant: grant,
    remainingCredits: subRemaining,
    reservedCredits: Number(subscription.reservedCredits || 0),
    ledgerTailBalance: ledgerTail,
    dashboardCredits,
    userCacheCredits: userRemaining,
    renewalDate: subscription.periodEnd || null,
    status: subscription.status,
    planMismatch,
    stripeMongoMismatch,
    creditDrift,
    needsManualReview: !authoritative.plan || (planMismatch && !stripePriceId),
  };
}

export async function auditProductionPlans(options = {}) {
  const { userId, snapshotName, limit } = options;
  const planCache = new Map();

  let users;
  if (userId) {
    users = await User.find({ _id: userId }).select("_id email stripeCustomerId remainingCredits").lean();
  } else {
    const userIds = await Subscription.distinct("userId");
    let q = User.find({ _id: { $in: userIds } }).select("_id email stripeCustomerId remainingCredits").lean();
    if (limit) q = q.limit(limit);
    users = await q;
  }

  const rows = [];
  for (const user of users) {
    rows.push(await auditOneUser(user, { snapshotName, planCache }));
  }

  const active = rows.filter((r) => !r.skipped);
  const mismatches = active.filter((r) => r.planMismatch || r.stripeMongoMismatch || r.creditDrift?.length);
  const manualReview = active.filter((r) => r.needsManualReview);

  const summary = {
    usersScanned: users.length,
    subscribers: active.length,
    basic: active.filter((r) => r.family === "basic").length,
    super: active.filter((r) => r.family === "super").length,
    unlimited: active.filter((r) => r.family === "unlimited").length,
    campaign: active.filter((r) => r.family === "campaign").length,
    mismatches: mismatches.length,
    corrected: 0,
    manualReview: manualReview.length,
    rows: active,
    mismatchDetails: mismatches,
    manualReviewDetails: manualReview,
  };
  return summary;
}

export async function repairProductionPlans(options = {}) {
  const audit = await auditProductionPlans(options);
  const results = [];
  if (options.dryRun) {
    return { audit, results, corrected: 0 };
  }

  for (const row of audit.mismatchDetails.filter((r) => r.planMismatch)) {
    const sub = await getLatestSubscription(row.userId);
    if (!sub) continue;
    try {
      const result = await repairSubscriptionPlanMapping(sub, {
        snapshotName: options.snapshotName,
        dryRun: false,
      });
      results.push({ userId: row.userId, ...result });
      if (result.repaired) audit.corrected += 1;
    } catch (err) {
      results.push({ userId: row.userId, repaired: false, error: err?.message || String(err) });
    }
  }
  return { audit, results, corrected: audit.corrected };
}
