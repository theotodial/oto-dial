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
  const jobId = `campaign-${String(campaignId)}`;
  try {
    const existing = await campaignQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "failed" || state === "completed") {
        await existing.remove();
      } else {
        return true;
      }
    }

    await campaignQueue.add(
      "run",
      { campaignId: String(campaignId), userId: String(userId) },
      {
        jobId,
        attempts: 1,
      }
    );
    return true;
  } catch (e) {
    if (String(e?.message || "").includes("already exists")) {
      try {
        const existing = await campaignQueue.getJob(jobId);
        const state = existing ? await existing.getState() : null;
        if (state === "failed" || state === "completed") {
          await existing.remove();
          await campaignQueue.add(
            "run",
            { campaignId: String(campaignId), userId: String(userId) },
            { jobId, attempts: 1 }
          );
        }
        return true;
      } catch (retryErr) {
        console.warn("[campaign-queue] duplicate recovery failed, falling back:", retryErr?.message || retryErr);
        return false;
      }
    }
    console.warn("[campaign-queue] enqueue failed, falling back:", e?.message || e);
    return false;
  }
}

export async function getCampaignQueueHealth() {
  if (!campaignQueue) {
    return { available: false, waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 };
  }
  const counts = await campaignQueue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
  return { available: true, ...counts };
}

export async function recoverCampaignQueue() {
  if (!campaignQueue) return { recovered: 0, quarantined: 0, available: false };
  const failedJobs = await campaignQueue.getJobs(["failed"], 0, 25, true);
  let recovered = 0;
  let quarantined = 0;
  for (const job of failedJobs) {
    const failedAt = Number(job.failedReason ? job.finishedOn || 0 : 0);
    const ageMs = failedAt ? Date.now() - failedAt : 0;
    if (ageMs && ageMs < 30_000) continue;
    try {
      await job.retry();
      recovered += 1;
    } catch {
      quarantined += 1;
    }
  }
  return { recovered, quarantined, available: true };
}

export async function closeCampaignQueue() {
  await campaignWorker?.close();
  await campaignQueue?.close();
}
