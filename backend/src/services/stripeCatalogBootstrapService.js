import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";
import {
  STRIPE_PLAN_PRICE_IDS,
  getCanonicalPlanPriceId,
  getCanonicalAddonPriceId
} from "../config/stripeCatalog.js";
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

  const plans = await Plan.find({ active: true });
  for (const plan of plans) {
    const looksUnlimited =
      plan.type === UNLIMITED_PLAN_TYPE ||
      /unlimited/i.test(String(plan.name || "")) ||
      /unlimited/i.test(String(plan.planName || ""));

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

export default {
  ensureStripeCatalogConsistency
};
