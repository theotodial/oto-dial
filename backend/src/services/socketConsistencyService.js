/**
 * Authoritative call state fan-out to user Socket.IO namespace (/user).
 */

import { computeCanonicalCallSnapshot } from "./callConvergenceService.js";
import { recordTelecomEventSequence } from "./telecomSequenceService.js";
import { persistWebhookLatencySample } from "./webhookLatencyService.js";
import { emitCallAuthoritativeState } from "../events/smsEvents.js";

/**
 * @param {object} opts
 * @param {import("mongoose").Types.ObjectId|string} opts.callId
 * @param {import("mongoose").Types.ObjectId|string|null} [opts.userId]
 * @param {string} [opts.source]
 * @param {string|null} [opts.eventType]
 */
export async function broadcastAuthoritativeCallState(opts = {}) {
  const conv = await computeCanonicalCallSnapshot(opts.callId);
  if (!conv.ok || !conv.snapshot) return null;
  const s = conv.snapshot;
  const userId = opts.userId || s.userId;
  if (!userId) return null;

  const broadcastAt = new Date();
  const payload = {
    callId: s.callId,
    userId: String(userId),
    callStateVersion: s.callStateVersion,
    callStatus: s.callStatus,
    timelineState: s.timelineState,
    economicVersion: s.economicVersion,
    updatedAt: s.updatedAt,
    source: opts.source || "socket_consistency",
    sequence: s.latestSequence?.sequenceNumber ?? null,
    snapshot: s,
  };

  emitCallAuthoritativeState(userId, payload);

  void persistWebhookLatencySample({
    callId: opts.callId,
    userId,
    eventType: opts.eventType || null,
    socketBroadcastAt: broadcastAt,
  }).catch(() => {});

  void recordTelecomEventSequence({
    callId: opts.callId,
    provider: "internal",
    providerEventId: null,
    providerTimestamp: broadcastAt,
    receivedAt: broadcastAt,
    eventType: "socket_broadcast",
    source: opts.source || "socketConsistencyService",
    orderingAccepted: true,
    orderingReason: "authoritative_broadcast",
    currentCallStatus: s.callStatus,
    nextCallStatus: s.callStatus,
    duplicate: false,
    metadata: { sequence: payload.sequence },
  }).catch(() => {});

  return payload;
}
