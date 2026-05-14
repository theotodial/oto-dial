/**
 * Clock drift / timestamp sanity (read-only). Forensics only.
 */

import TelecomEventSequence from "../models/TelecomEventSequence.js";
import BillingEventJournal from "../models/BillingEventJournal.js";
import ProfitEvent from "../models/ProfitEvent.js";
import { persistTelecomChaosSnapshot } from "./chaosSnapshotService.js";
import { chaosStructuredLog } from "../utils/chaosStructuredLog.js";

const DRIFT_MS = Math.max(1000, Number(process.env.CHAOS_CLOCK_DRIFT_MS || 2500));

/**
 * Compare provider vs receive timestamps on recent telecom sequence rows.
 */
export async function measureWorkerClockDrift(opts = {}) {
  const limit = Math.min(200, Math.max(20, Number(opts.limit || 80)));
  const since = new Date(Date.now() - Number(opts.sinceMs || 4 * 3600 * 1000));
  const rows = await TelecomEventSequence.find({
    receivedAt: { $gte: since },
    providerTimestamp: { $ne: null },
  })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .lean()
    .catch(() => []);

  let flagged = 0;
  for (const r of rows) {
    const ra = new Date(r.receivedAt).getTime();
    const pt = new Date(r.providerTimestamp).getTime();
    if (!Number.isFinite(ra) || !Number.isFinite(pt)) continue;
    if (Math.abs(ra - pt) > DRIFT_MS) {
      flagged += 1;
      chaosStructuredLog("[CLOCK DRIFT]", {
        callId: r.callId ? String(r.callId) : null,
        sequenceNumber: r.sequenceNumber,
        sourcePath: "clockDriftService.js",
        skewMs: ra - pt,
      });
      await persistTelecomChaosSnapshot({
        snapshotType: "clock_drift_detected",
        callId: r.callId || null,
        userId: null,
        workerId: opts.workerId || null,
        hostname: opts.hostname || null,
        processId: opts.processId ?? null,
        economicVersion: null,
        callStateVersion: null,
        timelineHash: "",
        journalHash: "",
        replayHash: "",
        metadata: { skewMs: ra - pt, providerTimestamp: r.providerTimestamp, receivedAt: r.receivedAt },
      });
      await ProfitEvent.create({
        eventType: "clock_drift_detected",
        severity: "warning",
        payload: { callId: r.callId ? String(r.callId) : null, skewMs: ra - pt },
        timestamp: new Date(),
      }).catch(() => {});
    }
  }

  const negWindow = await BillingEventJournal.countDocuments({
    eventType: "interval_charge",
    timestamp: { $gte: since },
    $expr: { $lt: ["$amount", { $literal: 0 }] },
    "metadata.intervalSeconds": { $lte: 0 },
  }).catch(() => 0);

  return { rowsSampled: rows.length, flagged, suspiciousNonPositiveIntervalMetadata: negWindow };
}
