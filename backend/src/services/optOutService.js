import OptOutList from "../models/OptOutList.js";
import Campaign from "../models/Campaign.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import { normalizeSmsDestination, isLikelyShortCode } from "../utils/phoneNormalize.js";

export async function isOptedOut(userId, phoneRaw) {
  const phone = normalizeSmsDestination(phoneRaw);
  if (!phone) return false;
  const doc = await OptOutList.findOne({ userId, phone }).select("_id").lean();
  return !!doc;
}

export async function recordOptOut(userId, phoneRaw) {
  const phone = normalizeSmsDestination(phoneRaw);
  if (!phone || isLikelyShortCode(phone)) return null;
  const doc = await OptOutList.findOneAndUpdate(
    { userId, phone },
    { $setOnInsert: { userId, phone } },
    { upsert: true, new: true }
  );
  return doc;
}

/**
 * Mark pending campaign rows for this account + sender phone as opted out.
 */
export async function markCampaignRecipientsOptedOutForUser(userId, phoneRaw) {
  const phone = normalizeSmsDestination(phoneRaw);
  if (!phone) return { modified: 0 };
  const campaigns = await Campaign.find({ userId }).select("_id").lean();
  const ids = campaigns.map((c) => c._id);
  if (!ids.length) return { modified: 0 };
  const res = await CampaignRecipient.updateMany(
    {
      campaignId: { $in: ids },
      phone,
      status: "pending",
    },
    {
      $set: {
        status: "opted_out",
        error: "Recipient opted out (STOP)",
        nextRetryAt: null,
      },
    }
  );
  return { modified: res.modifiedCount || 0 };
}

export async function countOptOutsForUser(userId) {
  return OptOutList.countDocuments({ userId });
}
