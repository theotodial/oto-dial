import mongoose from "mongoose";
import CampaignRecipient from "../models/CampaignRecipient.js";

const BUCKET_MS = 5 * 60 * 1000;

export async function getCampaignAnalytics(campaignId) {
  const cid = new mongoose.Types.ObjectId(String(campaignId));

  const [totals, sentRows] = await Promise.all([
    CampaignRecipient.aggregate([
      { $match: { campaignId: cid } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: {
            $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          optedOut: {
            $sum: { $cond: [{ $eq: ["$status", "opted_out"] }, 1, 0] },
          },
        },
      },
    ]),
    CampaignRecipient.find({ campaignId: cid, status: "sent" })
      .select({ updatedAt: 1 })
      .limit(20000)
      .lean(),
  ]);

  const row = totals[0] || {};
  const total = row.total || 0;
  const sent = row.sent || 0;
  const failed = row.failed || 0;
  const pending = row.pending || 0;
  const optedOut = row.optedOut || 0;

  const deliveryRate = total > 0 ? Math.round((sent / total) * 1000) / 10 : 0;
  const failureRate = total > 0 ? Math.round((failed / total) * 1000) / 10 : 0;

  const buckets = new Map();
  for (const r of sentRows) {
    if (!r.updatedAt) continue;
    const t = new Date(r.updatedAt).getTime();
    const b = Math.floor(t / BUCKET_MS) * BUCKET_MS;
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  const timeline = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, n]) => ({
      time: new Date(ms).toISOString(),
      sent: n,
    }));

  return {
    total,
    sent,
    failed,
    pending,
    optedOut,
    deliveryRate,
    failureRate,
    timeline,
  };
}
