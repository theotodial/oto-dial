import Call from "../models/Call.js";
import Subscription from "../models/Subscription.js";
import {
  isUnlimitedSubscription,
  incrementUnlimitedUsageAfterSuccess,
} from "./unlimitedUsageService.js";

/**
 * Atomically deduct subscription voice usage once per call (same lock pattern as Telnyx webhook).
 */
export async function tryDeductVoiceUsageForCall(call, billableSeconds) {
  const seconds = Math.max(0, Math.floor(Number(billableSeconds) || 0));
  if (seconds <= 0 || !call?.user) {
    return { ok: true, skipped: true };
  }

  const usageCountLock = await Call.updateOne(
    { _id: call._id, usageCountedAt: null },
    {
      $set: {
        usageCountedAt: new Date(),
        usageCountedSeconds: seconds,
      },
    }
  );

  if (usageCountLock.modifiedCount === 0) {
    return { ok: true, duplicate: true };
  }

  const subscription = await Subscription.findOne({
    userId: call.user,
    status: "active",
  });

  if (!subscription) {
    console.warn(
      `⚠️ No active subscription for user ${call.user} — usage not deducted`
    );
    return { ok: true, noSubscription: true };
  }

  if (isUnlimitedSubscription(subscription)) {
    const usageResult = await incrementUnlimitedUsageAfterSuccess({
      subscriptionId: subscription._id,
      userId: call.user,
      channel: "voice_client_hangup",
      minutesIncrementSeconds: seconds,
    });

    if (!usageResult.success && usageResult.limitReached) {
      console.warn(
        `⚠️ Voice usage increment hit Unlimited threshold for user ${call.user}`
      );
    }
  } else {
    const secondsUsedBefore = subscription.usage?.minutesUsed || 0;
    const minutesTotal =
      (subscription.limits?.minutesTotal || 2500) +
      (subscription.addons?.minutes || 0);
    const secondsTotal = minutesTotal * 60;
    const secondsRemainingBefore = Math.max(0, secondsTotal - secondsUsedBefore);
    const minutesRemainingBefore = secondsRemainingBefore / 60;

    await Subscription.findOneAndUpdate(
      { userId: call.user, status: "active" },
      { $inc: { "usage.minutesUsed": seconds } }
    );

    const secondsUsedAfter = secondsUsedBefore + seconds;
    const secondsRemainingAfter = Math.max(0, secondsTotal - secondsUsedAfter);
    const minutesRemainingAfter = secondsRemainingAfter / 60;

    console.log(`📊 USAGE DEDUCTED (WebRTC client):`);
    console.log(
      `   Call: ${call.direction} ${call.fromNumber} -> ${call.toNumber}`
    );
    console.log(
      `   Duration: ${seconds}s (${(seconds / 60).toFixed(3)} minutes)`
    );
    console.log(`   User: ${call.user}`);
    console.log(
      `   Before: ${secondsUsedBefore}s used, ${minutesRemainingBefore.toFixed(2)} min remaining`
    );
    console.log(
      `   After: ${secondsUsedAfter}s used, ${minutesRemainingAfter.toFixed(2)} min remaining`
    );
  }

  return { ok: true };
}
