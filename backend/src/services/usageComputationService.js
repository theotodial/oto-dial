import mongoose from "mongoose";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";

/** SMS credits: only {@link smsCostInfo.costDeducted} (numeric) counts; missing/null → 0. */
const smsCreditsGroupStage = {
  $group: {
    _id: null,
    smsUsed: {
      $sum: {
        $cond: [
          { $in: [{ $type: "$smsCostInfo.costDeducted" }, ["int", "long", "double", "decimal"]] },
          "$smsCostInfo.costDeducted",
          0,
        ],
      },
    },
  },
};

/**
 * Sum SMS credits for quota (optionally exclude documents, e.g. mid-billing for one outbound row).
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {{ excludeSmsIds?: import("mongoose").Types.ObjectId[], session?: import("mongoose").ClientSession }} [opts]
 */
export async function computeSmsCreditsUsed(userId, opts = {}) {
  if (!userId) return 0;

  const normalizedUserId =
    typeof userId === "string" && mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

  const excludeIds = (opts.excludeSmsIds || [])
    .filter(Boolean)
    .map((id) =>
      id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))
    );

  const match = {
    user: normalizedUserId,
    $or: [
      { direction: "inbound" },
      { direction: "outbound", status: { $nin: ["failed", "queued"] } },
    ],
  };
  if (excludeIds.length) {
    match._id = { $nin: excludeIds };
  }

  let agg = SMS.aggregate([{ $match: match }, smsCreditsGroupStage]);
  if (opts.session) {
    agg = agg.session(opts.session);
  }
  const rows = await agg.exec();
  return Math.max(0, Number(rows[0]?.smsUsed ?? 0));
}

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

  const [smsAgg, callAgg] = await Promise.all([
    SMS.aggregate([
      {
        $match: {
          user: normalizedUserId,
          $or: [
            { direction: "inbound" },
            { direction: "outbound", status: { $nin: ["failed", "queued"] } },
          ],
        },
      },
      smsCreditsGroupStage,
    ]),
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
  const smsUsed = Math.max(0, Number(smsAgg[0]?.smsUsed ?? 0));

  return {
    smsUsed,
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

  const [smsAgg, callAgg] = await Promise.all([
    SMS.aggregate([
      {
        $match: {
          user: normalizedUserId,
          createdAt: { $gte: start, $lte: end },
          $or: [
            { direction: "inbound" },
            { direction: "outbound", status: { $nin: ["failed", "queued"] } },
          ],
        },
      },
      smsCreditsGroupStage,
    ]),
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
  const smsUsed = Math.max(0, Number(smsAgg[0]?.smsUsed ?? 0));

  return {
    smsUsed,
    minutesUsed: secondsUsed / 60,
    secondsUsed,
  };
}
