import { Queue, Worker } from "bullmq";

let campaignQueue = null;
let campaignWorker = null;

function redisConnection() {
  const url = String(process.env.REDIS_URL || "").trim();
  if (url) {
    return { url };
  }
  const host = process.env.REDIS_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

/**
 * @param {(data: { campaignId: string, userId: string }) => Promise<void>} processor
 */
export function initCampaignQueue(processor) {
  const connection = redisConnection();
  if (!connection) {
    console.warn("[campaign-queue] Redis not configured — using in-process campaign worker only.");
    return false;
  }

  try {
    campaignQueue = new Queue("campaign-send", {
      connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86_400 },
      },
    });

    campaignWorker = new Worker(
      "campaign-send",
      async (job) => {
        const { campaignId, userId } = job.data || {};
        if (!campaignId || !userId) return;
        await processor({ campaignId, userId });
      },
      {
        connection,
        concurrency: Number(process.env.CAMPAIGN_QUEUE_CONCURRENCY || 2),
      }
    );

    campaignWorker.on("failed", (job, err) => {
      console.error("[campaign-queue] job failed:", job?.id, err?.message || err);
    });

    console.log("[campaign-queue] BullMQ worker started for campaign-send");
    return true;
  } catch (e) {
    console.error("[campaign-queue] Failed to init BullMQ:", e?.message || e);
    campaignQueue = null;
    campaignWorker = null;
    return false;
  }
}

export async function enqueueCampaignJob(campaignId, userId) {
  if (!campaignQueue) return false;
  try {
    await campaignQueue.add(
      "run",
      { campaignId: String(campaignId), userId: String(userId) },
      {
        jobId: `campaign-${String(campaignId)}`,
        attempts: 1,
      }
    );
    return true;
  } catch (e) {
    if (String(e?.message || "").includes("already exists")) {
      return true;
    }
    console.warn("[campaign-queue] enqueue failed, falling back:", e?.message || e);
    return false;
  }
}

export async function closeCampaignQueue() {
  await campaignWorker?.close();
  await campaignQueue?.close();
}
