import Campaign from "../models/Campaign.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import { sendOutboundSms } from "./smsOutboundService.js";
import { renderMessage } from "../utils/campaignMessageRender.js";
import { enqueueCampaignJob } from "./campaignQueueService.js";

const BATCH_SIZE = Number(process.env.CAMPAIGN_SMS_BATCH_SIZE || 50);
const BATCH_DELAY_MS = Number(process.env.CAMPAIGN_SMS_BATCH_DELAY_MS || 200);
/** Retry cadence: 1 min → 5 min → 15 min (per product spec) */
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

const activeJobs = new Set();

function delayForAttempt(failCount) {
  const idx = Math.min(Math.max(failCount - 1, 0), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx];
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function recomputeCampaignCounts(campaignId) {
  const [sent, failed, pending, optedOut] = await Promise.all([
    CampaignRecipient.countDocuments({ campaignId, status: "sent" }),
    CampaignRecipient.countDocuments({ campaignId, status: "failed" }),
    CampaignRecipient.countDocuments({ campaignId, status: "pending" }),
    CampaignRecipient.countDocuments({ campaignId, status: "opted_out" }),
  ]);
  const completed = pending === 0;
  await Campaign.findByIdAndUpdate(campaignId, {
    sentCount: sent,
    failedCount: failed,
    optedOutCount: optedOut,
    ...(completed
      ? { status: "completed", sendLock: false, sendLockedAt: null }
      : {}),
  });
  return { sent, failed, pending, optedOut };
}

function pendingQuery(campaignId) {
  const now = new Date();
  return {
    campaignId,
    status: "pending",
    $or: [
      { nextRetryAt: { $exists: false } },
      { nextRetryAt: null },
      { nextRetryAt: { $lte: now } },
    ],
  };
}

/**
 * Full campaign send (batched). Used by BullMQ worker or in-process fallback.
 */
export async function runCampaignJob(campaignId, userId) {
  const campaign = await Campaign.findOne({ _id: campaignId, userId }).lean();
  if (!campaign) return;

  const messageTemplate = String(campaign.messageBody || "").trim();
  if (!messageTemplate) {
    await Campaign.findByIdAndUpdate(campaignId, {
      status: "draft",
      sendLock: false,
      sendLockedAt: null,
    });
    return;
  }

  for (;;) {
    const pending = await CampaignRecipient.find(pendingQuery(campaignId))
      .sort({ createdAt: 1 })
      .limit(BATCH_SIZE)
      .lean();

    if (!pending.length) {
      await recomputeCampaignCounts(campaignId);
      break;
    }

    for (const rec of pending) {
      const vars =
        rec.variables && typeof rec.variables === "object" && !Array.isArray(rec.variables)
          ? rec.variables
          : {};
      const text = renderMessage(messageTemplate, vars);

      const result = await sendOutboundSms({
        userId,
        to: rec.phone,
        text,
        campaignId,
      });

      const now = new Date();

      if (result.ok) {
        await CampaignRecipient.updateOne(
          { _id: rec._id },
          {
            $set: {
              status: "sent",
              messageId: result.messageId,
              error: null,
              lastAttemptAt: now,
              nextRetryAt: null,
            },
          }
        );
      } else if (result.optedOut) {
        await CampaignRecipient.updateOne(
          { _id: rec._id },
          {
            $set: {
              status: "opted_out",
              error: result.error || "Opted out",
              lastAttemptAt: now,
              nextRetryAt: null,
            },
          }
        );
      } else {
        const failCount = Number(rec.retryCount || 0) + 1;
        const retryable = result.retryable === true && failCount <= 3;

        if (retryable) {
          const nextAt = new Date(now.getTime() + delayForAttempt(failCount));
          await CampaignRecipient.updateOne(
            { _id: rec._id },
            {
              $set: {
                retryCount: failCount,
                lastAttemptAt: now,
                nextRetryAt: nextAt,
                error: result.error || "Send failed",
              },
            }
          );
        } else {
          await CampaignRecipient.updateOne(
            { _id: rec._id },
            {
              $set: {
                status: "failed",
                error: result.error || "Send failed",
                lastAttemptAt: now,
                nextRetryAt: null,
                retryCount: failCount,
              },
            }
          );
        }
      }
    }

    await recomputeCampaignCounts(campaignId);

    if (pending.length < BATCH_SIZE) {
      break;
    }

    await sleep(BATCH_DELAY_MS);
  }
}

export function scheduleCampaignSend(campaignId, userId) {
  const tryQueue = async () => {
    const ok = await enqueueCampaignJob(campaignId, userId);
    if (ok) return true;
    return false;
  };

  tryQueue().then((usedQueue) => {
    if (usedQueue) return;
    const key = String(campaignId);
    if (activeJobs.has(key)) return;
    activeJobs.add(key);
    setImmediate(() => {
      runCampaignJob(campaignId, userId)
        .catch((err) => {
          console.error("[campaign] job failed:", campaignId, err?.message || err);
        })
        .finally(() => {
          activeJobs.delete(key);
        });
    });
  });
}

const STALE_LOCK_MS = Number(process.env.CAMPAIGN_STALE_LOCK_MS || 45 * 60 * 1000);

/**
 * Cron: start scheduled campaigns (draft + schedule.type scheduled + due).
 */
export async function tickScheduledCampaigns() {
  const now = new Date();

  const dueList = await Campaign.find({
    status: "draft",
    "schedule.type": "scheduled",
    "schedule.scheduledAt": { $lte: now },
    messageBody: { $nin: ["", null] },
    sendLock: { $ne: true },
  })
    .limit(25)
    .lean();

  for (const c of dueList) {
    const updated = await Campaign.findOneAndUpdate(
      {
        _id: c._id,
        status: "draft",
        sendLock: { $ne: true },
        "schedule.type": "scheduled",
        "schedule.scheduledAt": { $lte: now },
      },
      {
        $set: {
          sendLock: true,
          sendLockedAt: now,
          status: "running",
        },
      },
      { new: true }
    ).lean();

    if (updated) {
      scheduleCampaignSend(updated._id, updated.userId);
    }
  }
}

/**
 * Recover campaigns stuck in running + lock (process crash).
 */
export async function recoverStuckCampaignLocks() {
  const cutoff = new Date(Date.now() - STALE_LOCK_MS);
  const stuck = await Campaign.find({
    status: "running",
    sendLock: true,
    sendLockedAt: { $lt: cutoff },
  })
    .limit(20)
    .lean();

  for (const c of stuck) {
    const pending = await CampaignRecipient.countDocuments({
      campaignId: c._id,
      status: "pending",
    });
    await Campaign.updateOne(
      { _id: c._id },
      { $set: { sendLock: false, sendLockedAt: null } }
    );
    if (pending > 0) {
      scheduleCampaignSend(c._id, c.userId);
    } else {
      await recomputeCampaignCounts(c._id);
    }
  }
}
