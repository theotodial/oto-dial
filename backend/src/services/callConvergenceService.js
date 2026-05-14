/**
 * Single read-model snapshot merging Call, EconomicTimeline, billing journal tail,
 * and telecom sequence tail — for admin forensics, sockets, and reconciliation readers.
 */

import mongoose from "mongoose";
import Call from "../models/Call.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import BillingEventJournal from "../models/BillingEventJournal.js";
import TelecomEventSequence from "../models/TelecomEventSequence.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

/**
 * @param {import("mongoose").Types.ObjectId|string} callId
 */
export async function computeCanonicalCallSnapshot(callId) {
  const cid = toObjectId(callId);
  if (!cid) {
    return { ok: false, code: "invalid_call_id", snapshot: null };
  }
  const [call, timeline, journalTail, seqTail] = await Promise.all([
    Call.findById(cid).lean(),
    EconomicTimeline.findOne({ callId: cid }).lean(),
    BillingEventJournal.find({
      entityType: "call",
      $or: [{ entityId: cid }, { correlationId: cid }],
    })
      .sort({ timestamp: -1 })
      .limit(40)
      .lean(),
    TelecomEventSequence.find({ callId: cid }).sort({ sequenceNumber: -1 }).limit(25).lean(),
  ]);
  if (!call) {
    return { ok: false, code: "call_not_found", snapshot: null };
  }
  const lastSeq = seqTail[0] || null;
  const callStateVersion = `${new Date(call.updatedAt || call.createdAt || Date.now()).getTime()}:${call.status || ""}`;
  const economicVersion = timeline?.economicVersion ?? 0;
  const snapshot = {
    callId: String(cid),
    userId: call.user ? String(call.user) : null,
    callStateVersion,
    callStatus: call.status || null,
    timelineState: timeline?.timelineState || null,
    economicVersion,
    updatedAt: call.updatedAt || null,
    telnyxCallControlId: call.telnyxCallControlId || null,
    telnyxCallSessionId: call.telnyxCallSessionId || null,
    direction: call.direction || null,
    source: call.source || null,
    timeline: timeline
      ? {
          reservedCredits: timeline.reservedCredits,
          consumedCredits: timeline.consumedCredits,
          billedIntervalIndexes: timeline.billedIntervalIndexes || [],
          finalizedAt: timeline.finalizedAt || null,
        }
      : null,
    billingJournalTail: journalTail.map((j) => ({
      eventType: j.eventType,
      eventId: j.eventId,
      timestamp: j.timestamp,
      amount: j.amount,
    })),
    telecomSequenceTail: seqTail.map((s) => ({
      sequenceNumber: s.sequenceNumber,
      eventType: s.eventType,
      source: s.source,
      duplicate: s.duplicate,
      receivedAt: s.receivedAt,
    })),
    latestSequence: lastSeq
      ? {
          sequenceNumber: lastSeq.sequenceNumber,
          source: lastSeq.source,
          eventType: lastSeq.eventType,
        }
      : null,
  };
  return { ok: true, snapshot };
}
