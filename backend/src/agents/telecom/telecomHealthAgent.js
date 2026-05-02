import axios from "axios";
import SMS from "../../models/SMS.js";
import Call from "../../models/Call.js";
import SystemHealthMetric from "../../models/SystemHealthMetric.js";
import ProcessedWebhookEvent from "../../models/ProcessedWebhookEvent.js";
import { getCampaignQueueHealth } from "../../services/campaignQueueService.js";
import { getSmsQueueStats } from "../../services/smsQueueService.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";

const AGENT = "telecom-health-agent";
const WINDOW_MS = Number(process.env.AGENT_TELECOM_WINDOW_MS || 60 * 60 * 1000);

async function verifyTelnyxReachable() {
  const apiKey = String(process.env.TELNYX_API_KEY || "").trim();
  if (!apiKey) return { reachable: false, reason: "missing_api_key" };

  try {
    await axios.get("https://api.telnyx.com/v2/number_orders", {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { "page[size]": 1 },
      timeout: Number(process.env.AGENT_TELNYX_TIMEOUT_MS || 2500),
    });
    return { reachable: true };
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    return {
      reachable: status > 0 && status < 500,
      reason: error?.message || "telnyx_unreachable",
      status: status || null,
    };
  }
}

export const telecomHealthAgent = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_TELECOM_HEALTH_INTERVAL_MS || 5 * 60 * 1000),
  leaseMs: Number(process.env.AGENT_TELECOM_HEALTH_LEASE_MS || 4 * 60 * 1000),

  async run({ log }) {
    const since = new Date(Date.now() - WINDOW_MS);
    const [smsCounts, callCounts, latestWebhook, smsQueue, campaignQueue, telnyx] =
      await Promise.all([
        SMS.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: { direction: "$direction", status: "$status" }, count: { $sum: 1 } } },
        ]),
        Call.aggregate([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: { direction: "$direction", status: "$status" }, count: { $sum: 1 } } },
        ]),
        ProcessedWebhookEvent.findOne({ provider: /^telnyx/ }).sort({ processedAt: -1 }).lean(),
        Promise.resolve(getSmsQueueStats()),
        getCampaignQueueHealth().catch((error) => ({ available: false, error: error?.message || "queue_error" })),
        verifyTelnyxReachable(),
      ]);

    const sms = Object.fromEntries(
      smsCounts.map((row) => [`${row._id.direction}:${row._id.status}`, row.count])
    );
    const outboundTotal = Object.entries(sms)
      .filter(([key]) => key.startsWith("outbound:"))
      .reduce((sum, [, count]) => sum + count, 0);
    const delivered = Number(sms["outbound:delivered"] || 0);
    const failed = Number(sms["outbound:failed"] || 0);
    const smsDeliveryRate = outboundTotal ? (delivered / outboundTotal) * 100 : 100;
    const smsFailureRate = outboundTotal ? (failed / outboundTotal) * 100 : 0;

    const calls = Object.fromEntries(
      callCounts.map((row) => [`${row._id.direction}:${row._id.status}`, row.count])
    );
    const outboundCalls = Object.entries(calls)
      .filter(([key]) => key.startsWith("outbound:"))
      .reduce((sum, [, count]) => sum + count, 0);
    const connectedCalls =
      Number(calls["outbound:answered"] || 0) +
      Number(calls["outbound:in-progress"] || 0) +
      Number(calls["outbound:completed"] || 0);
    const abandonedCalls = Number(calls["outbound:failed"] || 0) + Number(calls["outbound:missed"] || 0);
    const callConnectRate = outboundCalls ? (connectedCalls / outboundCalls) * 100 : 100;
    const abandonedRate = outboundCalls ? (abandonedCalls / outboundCalls) * 100 : 0;

    const activeCalls = await Call.countDocuments({
      status: { $in: ["queued", "initiated", "dialing", "ringing", "in-progress", "answered"] },
    });
    const queueDepth =
      Number(smsQueue.depth || 0) +
      Number(campaignQueue.waiting || 0) +
      Number(campaignQueue.delayed || 0) +
      Number(campaignQueue.active || 0);
    const webhookLatency = latestWebhook?.processedAt
      ? Date.now() - new Date(latestWebhook.processedAt).getTime()
      : null;

    await SystemHealthMetric.create({
      smsDeliveryRate,
      smsFailureRate,
      callConnectRate,
      webhookLatency,
      abandonedRate,
      queueDepth,
      activeCalls,
      timestamp: new Date(),
      details: { telnyx, smsQueue, campaignQueue },
    });

    if (smsDeliveryRate < 70) {
      emitAgentAlert(AGENT, "critical", "sms_delivery_rate_low", { smsDeliveryRate, outboundTotal });
    }
    if (abandonedRate > 30) {
      emitAgentAlert(AGENT, "critical", "call_abandoned_rate_high", { abandonedRate, outboundCalls });
    }
    if (!telnyx.reachable) {
      emitAgentAlert(AGENT, "warning", "telnyx_reachability_degraded", telnyx);
    }

    log("info", "telecom_health_sampled", {
      smsDeliveryRate,
      smsFailureRate,
      callConnectRate,
      webhookLatency,
      abandonedRate,
      queueDepth,
      activeCalls,
    });

    return { smsDeliveryRate, smsFailureRate, callConnectRate, abandonedRate, queueDepth, activeCalls };
  },
};
