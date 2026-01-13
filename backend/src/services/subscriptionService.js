import Subscription from "../models/Subscription.js";
import PhoneNumber from "../models/PhoneNumber.js";

export async function loadUserSubscription(userId) {
  if (!userId) return null;

  const subscription = await Subscription.findOne({
    userId,
    status: "active",
  }).lean();

  if (!subscription) {
    return null;
  }

  const numbers = await PhoneNumber.find({
    userId,
    status: "active",
  }).lean();

  const minutesRemaining = Math.max(
    0,
    (subscription.limits?.minutesTotal || 0) +
      (subscription.addons?.minutes || 0) -
      (subscription.usage?.minutesUsed || 0)
  );

  const smsRemaining = Math.max(
    0,
    (subscription.limits?.smsTotal || 0) +
      (subscription.addons?.sms || 0) -
      (subscription.usage?.smsUsed || 0)
  );

  return {
    id: subscription._id,
    active: true,
    planId: subscription.planId,
    minutesRemaining,
    smsRemaining,
    numbers: numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      id: n._id,
    })),
  };
}
