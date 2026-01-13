import Subscription from "../models/Subscription.js";
import PhoneNumber from "../models/PhoneNumber.js";

/**
 * Load active subscription for a user
 * This is the SINGLE source of truth
 */
export async function loadUserSubscription(userId) {
  if (!userId) return null;

  const subscription = await Subscription.findOne({
    userId,
    status: "active"
  }).lean();

  if (!subscription) {
    return null;
  }

  const numbers = await PhoneNumber.find({
    userId,
    status: "active"
  }).lean();

  return {
    id: subscription._id,
    active: true,
    planId: subscription.planId,
    minutesRemaining: subscription.minutesRemaining ?? 0,
    smsRemaining: subscription.smsRemaining ?? 0,
    numbers: numbers.map(n => ({
      phoneNumber: n.phoneNumber,
      id: n._id
    }))
  };
}
