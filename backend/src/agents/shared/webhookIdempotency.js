import ProcessedWebhookEvent from "../../models/ProcessedWebhookEvent.js";
import { agentLog } from "./agentLogger.js";
import { extractWebhookEnvelope, hashPayload } from "./webhookPayloadHash.js";

export { extractWebhookEnvelope, hashPayload };

export async function claimWebhookEvent({ provider, eventId, eventType, payload }) {
  const payloadHash = hashPayload(payload);
  const eventKey = eventId
    ? String(eventId)
    : payload?.id
      ? `${eventType || "unknown"}:${String(payload.id)}`
      : `hash:${payloadHash}`;
  const safeEventId = eventKey;

  try {
    await ProcessedWebhookEvent.create({
      provider,
      eventId: safeEventId,
      eventType: eventType || null,
      payloadHash,
      processedAt: new Date(),
    });
    return { duplicate: false, eventId: safeEventId, payloadHash };
  } catch (error) {
    if (error?.code === 11000) {
      await ProcessedWebhookEvent.updateOne(
        { provider, eventId: safeEventId },
        {
          $inc: { duplicateCount: 1 },
          $set: { lastDuplicateAt: new Date(), payloadHash, eventType: eventType || null },
        }
      ).catch(() => {});
      agentLog("webhook-integrity-agent", "warning", "duplicate_webhook_ignored", {
        provider,
        eventId: safeEventId,
        eventType,
      });
      return { duplicate: true, eventId: safeEventId, payloadHash };
    }
    throw error;
  }
}
