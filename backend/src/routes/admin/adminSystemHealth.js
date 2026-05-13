import express from "express";
import SystemHealthMetric from "../../models/SystemHealthMetric.js";
import IsolationSecurityAlert from "../../models/IsolationSecurityAlert.js";
import QueueRecoveryEvent from "../../models/QueueRecoveryEvent.js";
import ProcessedWebhookEvent from "../../models/ProcessedWebhookEvent.js";
import CallLifecycleEvent from "../../models/CallLifecycleEvent.js";
import Call from "../../models/Call.js";
import { getAgentRuntimeSnapshot } from "../../agents/agentRuntime.js";
import { getCampaignQueueHealth } from "../../services/campaignQueueService.js";
import { getSmsQueueStats } from "../../services/smsQueueService.js";
import { ACTIVE_CALL_STATUSES } from "../../utils/callStateMachine.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const [runtime, latestMetric, securityAlerts, queueEvents, webhookDuplicates, callEvents, activeCalls, campaignQueue] =
      await Promise.all([
        getAgentRuntimeSnapshot(),
        SystemHealthMetric.findOne({}).sort({ timestamp: -1 }).lean(),
        IsolationSecurityAlert.find({ quarantineStatus: { $in: ["open", "quarantined"] } })
          .sort({ lastSeenAt: -1 })
          .limit(20)
          .lean(),
        QueueRecoveryEvent.find({}).sort({ timestamp: -1 }).limit(20).lean(),
        ProcessedWebhookEvent.find({ duplicateCount: { $gt: 0 } })
          .sort({ lastDuplicateAt: -1 })
          .limit(20)
          .lean(),
        CallLifecycleEvent.find({}).sort({ timestamp: -1 }).limit(20).lean(),
        Call.countDocuments({ status: { $in: ACTIVE_CALL_STATUSES } }),
        getCampaignQueueHealth().catch((error) => ({ available: false, error: error?.message || "queue_unavailable" })),
      ]);

    res.json({
      success: true,
      runtime,
      telecom: latestMetric || null,
      queues: {
        sms: getSmsQueueStats(),
        campaign: campaignQueue,
        recentEvents: queueEvents,
      },
      webhooks: {
        duplicateEvents: webhookDuplicates,
      },
      calls: {
        activeCalls,
        recentEvents: callEvents,
      },
      security: {
        alerts: securityAlerts,
      },
      sync: {
        staleWebsocketCount: null,
        stateResyncEvent: "state_resync_required",
      },
    });
  } catch (error) {
    console.error("[adminSystemHealth] load failed:", error?.message || error);
    res.status(500).json({ success: false, error: "Failed to load system health" });
  }
});

export default router;
