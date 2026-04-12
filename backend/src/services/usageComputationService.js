import mongoose from "mongoose";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";

/**
 * Authoritative usage from Mongo collections only (not User, not subscription.usage).
 * SMS: `sms` collection, field `user`. Call: `calls` collection; billable seconds prefer `billedSeconds`, else `durationSeconds`.
 */
export async function computeUsage(userId) {
  if (!userId) {
    return { smsUsed: 0, minutesUsed: 0, secondsUsed: 0 };
  }

  const normalizedUserId =
    typeof userId === "string" && mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

  const [smsUsed, callAgg] = await Promise.all([
    SMS.countDocuments({
      user: normalizedUserId,
      direction: { $in: ["outbound", "sent"] },
    }),
    Call.aggregate([
      { $match: { user: normalizedUserId, status: "completed" } },
      {
        $group: {
          _id: null,
          totalSeconds: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$billedSeconds", 0] }, 0] },
                "$billedSeconds",
                { $ifNull: ["$durationSeconds", 0] },
              ],
            },
          },
        },
      },
    ]),
  ]);

  const secondsUsed = Math.max(0, Number(callAgg[0]?.totalSeconds ?? 0));

  return {
    smsUsed: Math.max(0, Number(smsUsed ?? 0)),
    minutesUsed: secondsUsed / 60,
    secondsUsed,
  };
}

/**
 * Same as {@link computeUsage} but restricted to `[windowStart, windowEnd]` on `createdAt`
 * (SMS + completed calls). Used for unlimited-plan daily/monthly internal caps.
 */
export async function computeUsageInWindow(userId, windowStart, windowEnd) {
  if (!userId || !windowStart || !windowEnd) {
    return { smsUsed: 0, minutesUsed: 0, secondsUsed: 0 };
  }

  const normalizedUserId =
    typeof userId === "string" && mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

  const start =
    windowStart instanceof Date ? windowStart : new Date(windowStart);
  const end = windowEnd instanceof Date ? windowEnd : new Date(windowEnd);

  const [smsUsed, callAgg] = await Promise.all([
    SMS.countDocuments({
      user: normalizedUserId,
      direction: { $in: ["outbound", "sent"] },
      createdAt: { $gte: start, $lte: end },
    }),
    Call.aggregate([
      {
        $match: {
          user: normalizedUserId,
          status: "completed",
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          totalSeconds: {
            $sum: {
              $cond: [
                { $gt: [{ $ifNull: ["$billedSeconds", 0] }, 0] },
                "$billedSeconds",
                { $ifNull: ["$durationSeconds", 0] },
              ],
            },
          },
        },
      },
    ]),
  ]);

  const secondsUsed = Math.max(0, Number(callAgg[0]?.totalSeconds ?? 0));

  return {
    smsUsed: Math.max(0, Number(smsUsed ?? 0)),
    minutesUsed: secondsUsed / 60,
    secondsUsed,
  };
}
