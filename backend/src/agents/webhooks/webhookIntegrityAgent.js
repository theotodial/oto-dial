import SMS from "../../models/SMS.js";
import Call from "../../models/Call.js";
import ProcessedWebhookEvent from "../../models/ProcessedWebhookEvent.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";

const AGENT = "webhook-integrity-agent";

export const webhookIntegrityAgent = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_WEBHOOK_INTEGRITY_INTERVAL_MS || 5 * 60 * 1000),
  leaseMs: Number(process.env.AGENT_WEBHOOK_INTEGRITY_LEASE_MS || 4 * 60 * 1000),

  async run({ log }) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [duplicates, missingDeliveryEvents, missingAnswerEvents, malformed] = await Promise.all([
      ProcessedWebhookEvent.countDocuments({ duplicateCount: { $gt: 0 }, lastDuplicateAt: { $gte: since } }),
      SMS.countDocuments({
        direction: "outbound",
        status: "sent",
        updatedAt: { $lte: new Date(Date.now() - 30 * 60 * 1000) },
      }),
      Call.countDocuments({
        status: { $in: ["ringing", "dialing"] },
        createdAt: { $lte: new Date(Date.now() - 5 * 60 * 1000) },
      }),
      ProcessedWebhookEvent.countDocuments({ eventId: /^hash:/, processedAt: { $gte: since } }),
    ]);

    if (duplicates > 25) {
      emitAgentAlert(AGENT, "warning", "webhook_replay_spike", { duplicates });
    }
    if (missingDeliveryEvents > 100) {
      emitAgentAlert(AGENT, "warning", "sms_delivery_event_backlog", { missingDeliveryEvents });
    }
    if (missingAnswerEvents > 25) {
      emitAgentAlert(AGENT, "warning", "call_answer_event_backlog", { missingAnswerEvents });
    }

    log("info", "webhook_integrity_scan_complete", {
      duplicates,
      missingDeliveryEvents,
      missingAnswerEvents,
      malformed,
    });

    return { duplicates, missingDeliveryEvents, missingAnswerEvents, malformed };
  },
};
