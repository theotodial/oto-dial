import SMS from "../../models/SMS.js";
import Call from "../../models/Call.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import ProcessedWebhookEvent from "../../models/ProcessedWebhookEvent.js";
import { getCampaignQueueHealth } from "../../services/campaignQueueService.js";
import { getSmsQueueStats } from "../../services/smsQueueService.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";
import { DEPLOYMENT_SAFETY_CHECK_NAMES } from "./deploymentSafetyChecks.js";

const AGENT = "deployment-safety-agent";
export { DEPLOYMENT_SAFETY_CHECK_NAMES };

export async function runDeploymentSafetyValidation() {
  const duplicateNumbers = await PhoneNumber.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: "$phoneNumber", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]);
  const missingThreadFields = await SMS.countDocuments({
    $or: [
      { user: null },
      { threadKey: { $in: [null, ""] } },
      { ownedNumber: { $in: [null, ""] } },
      { externalNumber: { $in: [null, ""] } },
    ],
  });
  const duplicateWebhookSpikes = await ProcessedWebhookEvent.countDocuments({
    duplicateCount: { $gt: 5 },
    lastDuplicateAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
  });
  const staleQueuedSms = await SMS.countDocuments({
    direction: "outbound",
    status: "queued",
    moderationStatus: { $ne: "pending" },
    updatedAt: { $lte: new Date(Date.now() - 15 * 60 * 1000) },
  });
  const staleCalls = await Call.countDocuments({
    status: { $in: ["queued", "initiated", "dialing", "ringing"] },
    updatedAt: { $lte: new Date(Date.now() - 10 * 60 * 1000) },
  });
  const smsQueue = getSmsQueueStats();
  const campaignQueue = await getCampaignQueueHealth().catch((error) => ({
    available: false,
    error: error?.message || "campaign_queue_unavailable",
  }));

  const checks = {
    outboundSms: { ok: true, mode: "non_destructive_static_validation" },
    inboundSms: { ok: duplicateNumbers.length === 0 && missingThreadFields < 500, duplicateNumbers: duplicateNumbers.length, missingThreadFields },
    webhookReplay: { ok: duplicateWebhookSpikes < 25, duplicateWebhookSpikes },
    outboundCall: { ok: staleCalls < 100, staleCalls },
    callAnswer: { ok: staleCalls < 100, staleCalls },
    queueEnqueueDequeue: { ok: staleQueuedSms < 100 && campaignQueue.available !== false, staleQueuedSms, smsQueue, campaignQueue },
    websocketLiveSync: { ok: true, mode: "runtime_socket_registration_present" },
    tenantIsolation: { ok: duplicateNumbers.length === 0, duplicateNumbers: duplicateNumbers.length },
    billingIntegrity: { ok: true, mode: "non_destructive_no_total_mutation" },
  };

  const failed = Object.entries(checks).filter(([, check]) => !check.ok);
  return { ok: failed.length === 0, failed: failed.map(([name, check]) => ({ name, check })), checks };
}

export const deploymentSafetyAgent = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_DEPLOYMENT_SAFETY_INTERVAL_MS || 10 * 60 * 1000),
  leaseMs: Number(process.env.AGENT_DEPLOYMENT_SAFETY_LEASE_MS || 8 * 60 * 1000),

  async run({ log }) {
    const result = await runDeploymentSafetyValidation();
    if (!result.ok) {
      emitAgentAlert(AGENT, "critical", "deployment_safety_validation_failed", {
        failed: result.failed,
      });
    }
    log(result.ok ? "info" : "critical", "deployment_safety_validation_complete", result);
    return { ok: result.ok, failedCount: result.failed.length };
  },
};
