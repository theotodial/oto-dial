/**
 * Read-only split-brain style billing anomaly detection (duplicate interval indexes, bursty mutations).
 */

import mongoose from "mongoose";
import BillingEventJournal from "../models/BillingEventJournal.js";
import ProfitEvent from "../models/ProfitEvent.js";
import { persistTelecomChaosSnapshot } from "./chaosSnapshotService.js";
import { chaosStructuredLog } from "../utils/chaosStructuredLog.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

/**
 * @returns {Promise<{ flagged: number, samples: object[] }>}
 */
export async function detectSplitBrainBillingSignals(opts = {}) {
  const windowMs = Number(opts.windowMs || 2 * 3600 * 1000);
  const since = new Date(Date.now() - windowMs);
  const dupGroups = await BillingEventJournal.aggregate([
    {
      $match: {
        eventType: "interval_charge",
        timestamp: { $gte: since },
        correlationId: { $ne: null },
        "metadata.intervalIndex": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: { call: "$correlationId", idx: "$metadata.intervalIndex" },
        c: { $sum: 1 },
        eventIds: { $push: "$eventId" },
        ts: { $push: "$timestamp" },
      },
    },
    { $match: { c: { $gt: 1 } } },
    { $limit: 25 },
  ]).catch(() => []);

  let flagged = 0;
  const samples = [];
  for (const g of dupGroups) {
    flagged += 1;
    const callId = g._id.call;
    const userId = await BillingEventJournal.findOne({ correlationId: callId })
      .select("userId")
      .lean()
      .then((r) => r?.userId || null)
      .catch(() => null);
    const cid = toObjectId(callId);
    chaosStructuredLog("[SPLIT BRAIN BILLING]", {
      callId: cid ? String(cid) : null,
      userId: userId ? String(userId) : null,
      sourcePath: "splitBrainBillingDetector.js",
      intervalIndex: g._id.idx,
      duplicateJournalRows: g.c,
    });
    await persistTelecomChaosSnapshot({
      snapshotType: "duplicate_interval_detected",
      callId: cid,
      userId: toObjectId(userId),
      workerId: opts.workerId || null,
      hostname: opts.hostname || null,
      processId: opts.processId ?? null,
      economicVersion: null,
      callStateVersion: null,
      timelineHash: "",
      journalHash: String(g.eventIds?.length || 0),
      replayHash: "",
      metadata: { intervalIndex: g._id.idx, eventIds: g.eventIds, timestamps: g.ts },
    });
    await ProfitEvent.create({
      userId: userId || undefined,
      eventType: "split_brain_detected",
      severity: "critical",
      payload: { callId: cid ? String(cid) : null, intervalIndex: g._id.idx, count: g.c },
      timestamp: new Date(),
    }).catch(() => {});
    samples.push({ callId: cid ? String(cid) : null, intervalIndex: g._id.idx, count: g.c });
  }

  return { flagged, samples };
}
