import User from "../models/User.js";

/**
 * Align User.features / preferences with the assigned Mongo plan (Stripe is billing only).
 */
export async function applyUserEntitlementsForPlan(userId, plan) {
  if (!userId || !plan) return;

  const updates = {};
  if (plan.smsCampaignPlan) {
    updates["features.voiceEnabled"] = false;
    updates["features.campaignEnabled"] = true;
    updates["preferences.campaignMode"] = "pro";
  } else if (plan.voiceCallsEnabled !== false) {
    updates["features.voiceEnabled"] = true;
  }

  if (Object.keys(updates).length === 0) return;

  await User.updateOne({ _id: userId }, { $set: updates });
}
