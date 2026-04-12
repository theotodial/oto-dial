import Call from "../models/Call.js";

/**
 * Marks a call as usage-processed once (idempotent). Voice minutes are derived from the Call
 * collection — we do not write usage onto Subscription or User.
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

  return { ok: true };
}
