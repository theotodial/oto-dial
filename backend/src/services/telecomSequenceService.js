/**
 * Append-only telecom event sequence log (observability + ordering metadata).
 * Does not replace call state machine or billing — telemetry only.
 */

import mongoose from "mongoose";
import TelecomEventSequence from "../models/TelecomEventSequence.js";
import TelecomCallSequenceCounter from "../models/TelecomCallSequenceCounter.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

async function nextSequenceForCall(callId) {
  const cid = toObjectId(callId);
  if (!cid) {
    return Number(Date.now() % 2147483647);
  }
  const row = await TelecomCallSequenceCounter.findOneAndUpdate(
    { callId: cid },
    { $inc: { seq: 1 }, $setOnInsert: { callId: cid } },
    { upsert: true, new: true }
  ).lean();
  return Number(row?.seq || 0);
}

/**
 * @param {object} params
 * @param {import("mongoose").Types.ObjectId|string|null} [params.callId]
 * @param {string} params.provider
 * @param {string|null} [params.providerEventId]
 * @param {Date|string|null} [params.providerTimestamp]
 * @param {Date} [params.receivedAt]
 * @param {string|null} [params.eventType]
 * @param {string|null} [params.source]
 * @param {boolean} [params.orderingAccepted]
 * @param {string|null} [params.orderingReason]
 * @param {string|null} [params.currentCallStatus]
 * @param {string|null} [params.nextCallStatus]
 * @param {boolean} [params.duplicate]
 * @param {object} [params.metadata]
 */
export async function recordTelecomEventSequence(params = {}) {
  if (mongoose.connection.readyState !== 1) return null;
  const callId = toObjectId(params.callId);
  const sequenceNumber = await nextSequenceForCall(callId);
  const doc = {
    callId: callId || null,
    provider: String(params.provider || "unknown"),
    providerEventId: params.providerEventId != null ? String(params.providerEventId) : null,
    providerTimestamp: params.providerTimestamp ? new Date(params.providerTimestamp) : null,
    receivedAt: params.receivedAt ? new Date(params.receivedAt) : new Date(),
    eventType: params.eventType != null ? String(params.eventType) : null,
    source: params.source != null ? String(params.source) : null,
    sequenceNumber,
    orderingAccepted: params.orderingAccepted !== false,
    orderingReason: params.orderingReason != null ? String(params.orderingReason) : null,
    currentCallStatus: params.currentCallStatus != null ? String(params.currentCallStatus) : null,
    nextCallStatus: params.nextCallStatus != null ? String(params.nextCallStatus) : null,
    duplicate: Boolean(params.duplicate),
    metadata: params.metadata && typeof params.metadata === "object" ? params.metadata : {},
  };
  try {
    return await TelecomEventSequence.create(doc);
  } catch (err) {
    console.warn("[telecomSequenceService] record failed", err?.message || err);
    return null;
  }
}

export async function listTelecomSequenceForCall(callId, limit = 200) {
  const cid = toObjectId(callId);
  if (!cid) return [];
  return TelecomEventSequence.find({ callId: cid })
    .sort({ sequenceNumber: 1 })
    .limit(Math.min(500, Math.max(1, limit)))
    .lean();
}
