import Subscription from "../../models/Subscription.js";
import { getActiveAddonAmounts } from "../subscriptionAddonCreditService.js";
import { computeUsage } from "../usageComputationService.js";
import { isUnlimitedSubscription } from "../unlimitedUsageService.js";

/**
 * Single source of truth for SMS/call usage + remaining balances.
 * Counts come from Mongo `sms` + `calls` via {@link computeUsage} (same rules everywhere).
 *
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {object|null} [subscriptionLean] — optional preloaded latest subscription (lean) to avoid a duplicate query
 */
export async function getCanonicalUsage(userId, subscriptionLean = null) {
  if (!userId) return null;

  const subscription =
    subscriptionLean ??
    (await Subscription.findOne({ userId }).sort({ createdAt: -1 }).lean());

  if (!subscription) return null;

  const activity = await computeUsage(userId);
  const smsUsed = Math.max(0, Number(activity.smsUsed ?? 0));
  const minutesUsed = Math.max(0, Number(activity.minutesUsed ?? 0));
  const secondsUsed = Math.max(0, Number(activity.secondsUsed ?? 0));

  const activeAddons = getActiveAddonAmounts(subscription);
  const smsLimit = Math.max(
    0,
    Number(subscription.limits?.smsTotal ?? 0) + Number(activeAddons.smsActive ?? 0)
  );
  const minutesLimit = Math.max(
    0,
    Number(subscription.limits?.minutesTotal ?? 0) +
      Number(activeAddons.minutesActive ?? 0)
  );

  const unlimited =
    Boolean(subscription.displayUnlimited) ||
    isUnlimitedSubscription(subscription) ||
    /unlimited/i.test(String(subscription.planName || ""));

  const voiceOff = subscription.voiceCallsEnabled === false;

  return {
    smsUsed,
    minutesUsed,
    secondsUsed,
    smsRemaining: Math.max(0, smsLimit - smsUsed),
    minutesRemaining: Math.max(0, minutesLimit - minutesUsed),
    smsLimit,
    minutesLimit,
    isSmsEnabled: unlimited || smsLimit > 0,
    isCallEnabled: !voiceOff && (unlimited || minutesLimit > 0),
  };
}
