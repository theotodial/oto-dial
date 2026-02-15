import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";
import {
  getCanonicalPlanPriceId,
  getCanonicalAddonPriceId
} from "../config/stripeCatalog.js";

/**
 * Ensures Mongo plan/add-on Stripe price IDs are aligned with canonical catalog.
 * This protects production from stale or manually edited billing IDs.
 */
export async function ensureStripeCatalogConsistency() {
  const updates = {
    plansUpdated: 0,
    addonsUpdated: 0
  };

  const plans = await Plan.find({ active: true });
  for (const plan of plans) {
    const canonicalPriceId = getCanonicalPlanPriceId(plan);
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
