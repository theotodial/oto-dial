import Subscription from "../models/Subscription.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Plan from "../models/Plan.js";

// Default limits if subscription doesn't have them set
const DEFAULT_LIMITS = {
  minutesTotal: 2500,
  smsTotal: 200,
  numbersTotal: 1
};

export async function loadUserSubscription(userId) {
  if (!userId) return null;

  let subscription = await Subscription.findOne({
    userId,
    status: "active",
  }).lean();

  if (!subscription) {
    return null;
  }

  // Fix subscriptions with missing or zero limits
  const limitsNeedFix = !subscription.limits || 
    !subscription.limits.smsTotal || 
    !subscription.limits.minutesTotal;

  if (limitsNeedFix) {
    console.log("⚠️ Subscription missing limits, fixing:", subscription._id);
    
    // Try to get limits from plan
    let limits = DEFAULT_LIMITS;
    if (subscription.planId) {
      const plan = await Plan.findById(subscription.planId).lean();
      if (plan?.limits) {
        limits = plan.limits;
      }
    }

    // Update the subscription with proper limits
    await Subscription.updateOne(
      { _id: subscription._id },
      {
        $set: {
          limits: {
            minutesTotal: subscription.limits?.minutesTotal || limits.minutesTotal,
            smsTotal: subscription.limits?.smsTotal || limits.smsTotal,
            numbersTotal: subscription.limits?.numbersTotal || limits.numbersTotal
          }
        }
      }
    );

    // Reload subscription
    subscription = await Subscription.findById(subscription._id).lean();
    console.log("✅ Subscription limits fixed:", subscription.limits);
  }

  const numbers = await PhoneNumber.find({
    userId,
    status: "active",
  }).lean();

  const smsTotal = subscription.limits?.smsTotal || DEFAULT_LIMITS.smsTotal;
  const minutesTotal = subscription.limits?.minutesTotal || DEFAULT_LIMITS.minutesTotal;
  const smsAddons = subscription.addons?.sms || 0;
  const minutesAddons = subscription.addons?.minutes || 0;
  const smsUsed = subscription.usage?.smsUsed || 0;
  const minutesUsed = subscription.usage?.minutesUsed || 0;

  const minutesRemaining = Math.max(0, minutesTotal + minutesAddons - minutesUsed);
  const smsRemaining = Math.max(0, smsTotal + smsAddons - smsUsed);

  console.log("📊 Subscription loaded:", {
    userId,
    smsTotal,
    smsUsed,
    smsRemaining,
    minutesTotal,
    minutesUsed,
    minutesRemaining
  });

  return {
    id: subscription._id,
    active: true,
    planId: subscription.planId,
    minutesRemaining,
    smsRemaining,
    limits: subscription.limits,
    usage: subscription.usage,
    numbers: numbers.map((n) => ({
      phoneNumber: n.phoneNumber,
      id: n._id,
    })),
  };
}
