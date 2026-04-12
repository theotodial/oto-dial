import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";
import {
  STRIPE_PLAN_PRICE_IDS,
  getCanonicalPlanPriceId,
  getCanonicalAddonPriceId
} from "../config/stripeCatalog.js";
import {
  AFFILIATE_UNLIMITED_LIMITS,
  AFFILIATE_UNLIMITED_PLAN_NAME,
  AFFILIATE_UNLIMITED_PLAN_TYPE,
  AFFILIATE_UNLIMITED_STRIPE_PRICE_ID
} from "../constants/affiliatePlan.js";
import {
  UNLIMITED_INTERNAL_LIMITS,
  UNLIMITED_PLAN_NAME,
  UNLIMITED_PLAN_TYPE
} from "../constants/unlimitedPlan.js";

/**
 * Ensures Mongo plan/add-on Stripe price IDs are aligned with canonical catalog.
 * This protects production from stale or manually edited billing IDs.
 */
export async function ensureStripeCatalogConsistency() {
  const updates = {
    plansUpdated: 0,
    addonsUpdated: 0
  };

  const existingUnlimited = await Plan.findOne({
    $or: [
      { type: UNLIMITED_PLAN_TYPE },
      { name: new RegExp(`^${UNLIMITED_PLAN_NAME}$`, "i") },
      { planName: new RegExp(`^${UNLIMITED_PLAN_NAME}$`, "i") }
    ]
  });

  if (!existingUnlimited) {
    await Plan.create({
      type: UNLIMITED_PLAN_TYPE,
      name: UNLIMITED_PLAN_NAME,
      planName: UNLIMITED_PLAN_NAME,
      price: 119.99,
      currency: "USD",
      stripeProductId: "prod_Tj3I37A5KEUqJG",
      stripePriceId: STRIPE_PLAN_PRICE_IDS[UNLIMITED_PLAN_TYPE],
      limits: {
        minutesTotal: UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit,
        smsTotal: UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit,
        numbersTotal: UNLIMITED_INTERNAL_LIMITS.dedicatedNumbers
      },
      monthlySmsLimit: UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit,
      monthlyMinutesLimit: UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit,
      dailySmsLimit: UNLIMITED_INTERNAL_LIMITS.dailySmsLimit,
      dailyMinutesLimit: UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit,
      dedicatedNumbers: UNLIMITED_INTERNAL_LIMITS.dedicatedNumbers,
      displayUnlimited: true,
      active: true
    });
    updates.plansUpdated += 1;
    console.log("✅ Seeded missing Unlimited plan");
  }

  const existingAffiliateUnlimited = await Plan.findOne({
    $or: [
      { type: AFFILIATE_UNLIMITED_PLAN_TYPE },
      { stripePriceId: AFFILIATE_UNLIMITED_STRIPE_PRICE_ID },
      { name: new RegExp(`^${AFFILIATE_UNLIMITED_PLAN_NAME}$`, "i") }
    ]
  });

  if (!existingAffiliateUnlimited) {
    await Plan.create({
      type: AFFILIATE_UNLIMITED_PLAN_TYPE,
      name: AFFILIATE_UNLIMITED_PLAN_NAME,
      planName: AFFILIATE_UNLIMITED_PLAN_NAME,
      price: 119.99,
      currency: "USD",
      stripeProductId: "prod_Tj3I37A5KEUqJG",
      stripePriceId: AFFILIATE_UNLIMITED_STRIPE_PRICE_ID,
      limits: {
        minutesTotal: AFFILIATE_UNLIMITED_LIMITS.monthlyMinutesLimit,
        smsTotal: AFFILIATE_UNLIMITED_LIMITS.monthlySmsLimit,
        numbersTotal: AFFILIATE_UNLIMITED_LIMITS.dedicatedNumbers
      },
      monthlySmsLimit: AFFILIATE_UNLIMITED_LIMITS.monthlySmsLimit,
      monthlyMinutesLimit: AFFILIATE_UNLIMITED_LIMITS.monthlyMinutesLimit,
      dailySmsLimit: AFFILIATE_UNLIMITED_LIMITS.dailySmsLimit,
      dailyMinutesLimit: AFFILIATE_UNLIMITED_LIMITS.dailyMinutesLimit,
      dedicatedNumbers: AFFILIATE_UNLIMITED_LIMITS.dedicatedNumbers,
      displayUnlimited: true,
      active: true
    });
    updates.plansUpdated += 1;
    console.log("✅ Seeded missing Affiliate Unlimited plan");
  }

  const plans = await Plan.find({ active: true });
  for (const plan of plans) {
    if (plan.adminOnly) {
      continue;
    }

    const looksUnlimited =
      plan.type !== AFFILIATE_UNLIMITED_PLAN_TYPE &&
      (plan.type === UNLIMITED_PLAN_TYPE ||
      /unlimited/i.test(String(plan.name || "")) ||
      /unlimited/i.test(String(plan.planName || "")));

    if (looksUnlimited && !plan.displayUnlimited) {
      plan.type = UNLIMITED_PLAN_TYPE;
      plan.planName = plan.planName || UNLIMITED_PLAN_NAME;
      plan.displayUnlimited = true;
      plan.monthlySmsLimit =
        plan.monthlySmsLimit || UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit;
      plan.monthlyMinutesLimit =
        plan.monthlyMinutesLimit || UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit;
      plan.dailySmsLimit =
        plan.dailySmsLimit || UNLIMITED_INTERNAL_LIMITS.dailySmsLimit;
      plan.dailyMinutesLimit =
        plan.dailyMinutesLimit || UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit;
      plan.dedicatedNumbers =
        plan.dedicatedNumbers || UNLIMITED_INTERNAL_LIMITS.dedicatedNumbers;
      plan.limits = {
        minutesTotal: plan.monthlyMinutesLimit,
        smsTotal: plan.monthlySmsLimit,
        numbersTotal: plan.dedicatedNumbers
      };
      await plan.save();
      updates.plansUpdated += 1;
      console.log(`🔧 Normalized Unlimited plan identity: ${plan.name}`);
    }

    const canonicalPriceId = getCanonicalPlanPriceId(plan);
    if (
      plan.displayUnlimited &&
      (!plan.monthlySmsLimit ||
        !plan.monthlyMinutesLimit ||
        !plan.dailySmsLimit ||
        !plan.dailyMinutesLimit)
    ) {
      plan.type = plan.type || UNLIMITED_PLAN_TYPE;
      plan.planName = plan.planName || plan.name || UNLIMITED_PLAN_NAME;
      plan.monthlySmsLimit =
        plan.monthlySmsLimit || UNLIMITED_INTERNAL_LIMITS.monthlySmsLimit;
      plan.monthlyMinutesLimit =
        plan.monthlyMinutesLimit || UNLIMITED_INTERNAL_LIMITS.monthlyMinutesLimit;
      plan.dailySmsLimit =
        plan.dailySmsLimit || UNLIMITED_INTERNAL_LIMITS.dailySmsLimit;
      plan.dailyMinutesLimit =
        plan.dailyMinutesLimit || UNLIMITED_INTERNAL_LIMITS.dailyMinutesLimit;
      plan.dedicatedNumbers =
        plan.dedicatedNumbers || UNLIMITED_INTERNAL_LIMITS.dedicatedNumbers;
      plan.limits = {
        minutesTotal: plan.monthlyMinutesLimit,
        smsTotal: plan.monthlySmsLimit,
        numbersTotal: plan.dedicatedNumbers
      };
      await plan.save();
      updates.plansUpdated += 1;
      console.log(`🔧 Unlimited plan fields normalized: ${plan.name}`);
    }

    if (canonicalPriceId && plan.stripePriceId !== canonicalPriceId) {
      plan.stripePriceId = canonicalPriceId;
      await plan.save();
      updates.plansUpdated += 1;
      console.log(
        `🔧 Stripe catalog fix (plan): ${plan.name} -> ${canonicalPriceId}`
      );
    }
  }

  const addons = await AddonPlan.find({ active: true });
  for (const addon of addons) {
    const canonicalAddonPriceId = getCanonicalAddonPriceId(addon);
    if (canonicalAddonPriceId && addon.stripePriceId !== canonicalAddonPriceId) {
      addon.stripePriceId = canonicalAddonPriceId;
      await addon.save();
      updates.addonsUpdated += 1;
      console.log(
        `🔧 Stripe catalog fix (addon): ${addon.name} -> ${canonicalAddonPriceId}`
      );
    }
  }

  return updates;
}

/** Admin-assignable Mongo-only plans (no Stripe); ensures they exist for GET /api/admin/plans. */
export async function ensureAdminAssignableInternalPlans() {
  const spec = {
    type: "sms_1700",
    name: "1700 SMS",
    planName: "1700 SMS",
    price: 80,
    currency: "USD",
    limits: {
      minutesTotal: 0,
      smsTotal: 1700,
      numbersTotal: 1
    },
    dedicatedNumbers: 1,
    displayUnlimited: false,
    adminOnly: true,
    voiceCallsEnabled: false,
    active: true,
    stripeProductId: null,
    stripePriceId: null
  };

  const filter = {
    $or: [{ name: spec.name }, { type: spec.type }]
  };

  await Plan.findOneAndUpdate(
    filter,
    { $set: spec },
    { upsert: true, new: true, runValidators: true }
  );
  return { ok: true };
}

export default {
  ensureStripeCatalogConsistency,
  ensureAdminAssignableInternalPlans
};
