/**
 * Distributed webhook deduplication: Redis first (NX + TTL), Mongo durable record,
 * in-process memory ring as last-resort when Redis/Mongo unavailable.
 */

import ProcessedWebhookEvent from "../models/ProcessedWebhookEvent.js";
import { getRedisClient } from "./cache.service.js";
import { hashPayload } from "../agents/shared/webhookPayloadHash.js";
import { agentLog } from "../agents/shared/agentLogger.js";

const REDIS_TTL_SEC = Math.max(
  3600,
  Number(process.env.WEBHOOK_DEDUP_REDIS_TTL_SEC || 60 * 60 * 24 * 30)
);
const MEMORY_MAX = 8000;
const memoryOrder = [];
const memorySet = new Set();

function rememberMemory(key) {
  if (memorySet.has(key)) return true;
  memorySet.add(key);
  memoryOrder.push(key);
  while (memoryOrder.length > MEMORY_MAX) {
    const old = memoryOrder.shift();
    memorySet.delete(old);
  }
  return false;
}

/**
 * @param {object} opts
 * @param {string} opts.provider
 * @param {string|null} [opts.providerEventId] — alias eventId from Telnyx envelope
 * @param {string|null} [opts.eventId] — same as providerEventId for backward compatibility
 * @param {string|null} [opts.callId]
 * @param {string|null} [opts.eventType]
 * @param {object} [opts.payload]
 * @returns {Promise<{ accepted: boolean, duplicate: boolean, source: string, eventId: string, payloadHash: string }>}
 */
export async function claimWebhookEvent(opts = {}) {
  const provider = String(opts.provider || "unknown");
  const eventType = opts.eventType != null ? String(opts.eventType) : null;
  const payload = opts.payload ?? {};
  const payloadHash = hashPayload(payload);
  const rawId = opts.providerEventId ?? opts.eventId ?? null;
  const eventId = rawId
    ? String(rawId)
    : opts.eventType
      ? `${opts.eventType || "unknown"}:${payloadHash.slice(0, 24)}`
      : `hash:${payloadHash}`;
  const dedupKey = `${provider}:${eventId}`;

  const client = await getRedisClient();
  if (client?.isOpen) {
    try {
      const rKey = `wdedup:${dedupKey}`;
      const ok = await client.set(rKey, "1", { NX: true, EX: REDIS_TTL_SEC });
      if (ok !== "OK") {
        rememberMemory(dedupKey);
        return { accepted: false, duplicate: true, source: "redis", eventId, payloadHash };
      }
    } catch (e) {
      agentLog("webhook-dedup", "warning", "redis_claim_failed", { error: String(e?.message || e) });
    }
  }

  try {
    await ProcessedWebhookEvent.create({
      provider,
      eventId,
      eventType,
      payloadHash,
      processedAt: new Date(),
    });
    rememberMemory(dedupKey);
    return {
      accepted: true,
      duplicate: false,
      source: client?.isOpen ? "mongo_after_redis" : "mongo",
      eventId,
      payloadHash,
    };
  } catch (error) {
    if (error?.code === 11000) {
      await ProcessedWebhookEvent.updateOne(
        { provider, eventId },
        {
          $inc: { duplicateCount: 1 },
          $set: { lastDuplicateAt: new Date(), payloadHash, eventType },
        }
      ).catch(() => {});
      agentLog("webhook-dedup", "warning", "duplicate_webhook_ignored", { provider, eventId, eventType });
      rememberMemory(dedupKey);
      if (client?.isOpen) {
        try {
          await client.del(`wdedup:${dedupKey}`).catch(() => {});
        } catch {
          /* ignore */
        }
      }
      return { accepted: false, duplicate: true, source: "mongo", eventId, payloadHash };
    }
    throw error;
  }
}
