import SMS from "../../models/SMS.js";
import QueueRecoveryEvent from "../../models/QueueRecoveryEvent.js";
import { getCampaignQueueHealth, recoverCampaignQueue } from "../../services/campaignQueueService.js";
import { getSmsQueueStats } from "../../services/smsQueueService.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";

const AGENT = "queue-recovery-agent";

async function record(event) {
  await QueueRecoveryEvent.create({ timestamp: new Date(), ...event });
}

export const queueRecoveryAgent = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_QUEUE_RECOVERY_INTERVAL_MS || 60 * 1000),
  leaseMs: Number(process.env.AGENT_QUEUE_RECOVERY_LEASE_MS || 45 * 1000),

  async run({ log }) {
    const staleQueuedCutoff = new Date(Date.now() - Number(process.env.AGENT_SMS_QUEUED_STALE_MS || 10 * 60 * 1000));
    const staleQueuedSms = await SMS.find({
      direction: "outbound",
      status: "queued",
      moderationStatus: { $ne: "pending" },
      updatedAt: { $lte: staleQueuedCutoff },
    })
      .select("_id user updatedAt sendIdempotencyKey")
      .limit(50)
      .lean();

    for (const sms of staleQueuedSms) {
      await record({
        queue: "sms-outbound",
        jobId: String(sms._id),
        severity: "warning",
        event: "stale_queued_sms_detected",
        action: "quarantined_for_review",
        details: { userId: String(sms.user), updatedAt: sms.updatedAt },
      });
    }

    const smsQueue = getSmsQueueStats();
    const campaignQueue = await getCampaignQueueHealth().catch((error) => ({
      available: false,
      error: error?.message || "campaign_queue_unavailable",
    }));
    const campaignRecovery = await recoverCampaignQueue().catch((error) => ({
      recovered: 0,
      failed: true,
      error: error?.message || "campaign_recovery_failed",
    }));

    if (staleQueuedSms.length > 0) {
      emitAgentAlert(AGENT, "warning", "stale_queued_sms_detected", { count: staleQueuedSms.length });
    }
    if (campaignQueue.failed > 0) {
      emitAgentAlert(AGENT, "warning", "campaign_queue_failed_jobs_present", {
        failed: campaignQueue.failed,
        recovered: campaignRecovery.recovered,
      });
    }

    log("info", "queue_scan_complete", {
      smsQueue,
      campaignQueue,
      campaignRecovery,
      staleQueuedSms: staleQueuedSms.length,
    });

    return { smsQueue, campaignQueue, campaignRecovery, staleQueuedSms: staleQueuedSms.length };
  },
};
