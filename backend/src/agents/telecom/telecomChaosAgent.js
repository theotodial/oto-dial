import os from "os";
import Call from "../../models/Call.js";
import { getPressureSnapshot } from "../../services/telecomBackpressureService.js";
import { getRedisClient } from "../../services/cache.service.js";
import { validateTelecomEventOrdering } from "../../services/eventOrderValidationService.js";
import { detectSplitBrainBillingSignals } from "../../services/splitBrainBillingDetector.js";
import { measureWorkerClockDrift } from "../../services/clockDriftService.js";
import { sampleEconomicLockHealth } from "../../services/economicLockHealthService.js";
import { verifyReplayDeterminismSample } from "../../services/replayDeterminismVerifier.js";
import { persistTelecomChaosSnapshot } from "../../services/chaosSnapshotService.js";
import { chaosStructuredLog } from "../../utils/chaosStructuredLog.js";
import { ACTIVE_CALL_STATUSES } from "../../utils/callStateMachine.js";

const AGENT = "telecom-chaos-agent";
const BASE_MS = (11 + Math.random() * 6) * 60 * 1000;
const LEASE_MS = Number(process.env.AGENT_TELECOM_CHAOS_LEASE_MS || 14 * 60 * 1000);

async function detectRecoveryLoopOverlap(log, ownerId) {
  const client = await getRedisClient();
  if (!client?.isOpen) return false;
  const bucket = Math.floor(Date.now() / 60_000);
  const wid = String(ownerId || `pid:${process.pid}`);
  const key = `chaos:dedupe:${AGENT}:${wid}:${bucket}`;
  try {
    const n = await client.incr(key);
    if (n === 1) await client.expire(key, 120);
    if (n > 1) {
      log("warning", "recovery_overlap_suspected", { key, n });
      await persistTelecomChaosSnapshot({
        snapshotType: "recovery_loop_detected",
        callId: null,
        userId: null,
        workerId: null,
        hostname: os.hostname(),
        processId: process.pid,
        economicVersion: null,
        callStateVersion: null,
        timelineHash: "",
        journalHash: "",
        replayHash: "",
        metadata: { key, n },
      });
      chaosStructuredLog("[CHAOS DETECTOR]", {
        sourcePath: "telecomChaosAgent.js",
        kind: "recovery_overlap",
        hostname: os.hostname(),
        pid: process.pid,
      });
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function scanOrphanActiveCalls(log) {
  const cutoff = new Date(Date.now() - Number(process.env.CHAOS_ORPHAN_HEARTBEAT_MS || 25 * 60 * 1000));
  const rows = await Call.find({
    status: { $in: ACTIVE_CALL_STATUSES },
    $or: [{ lastHeartbeatAt: { $lt: cutoff } }, { lastHeartbeatAt: null }],
  })
    .limit(12)
    .select("_id user status lastHeartbeatAt")
    .lean()
    .catch(() => []);
  for (const c of rows) {
    chaosStructuredLog("[CHAOS DETECTOR]", {
      callId: String(c._id),
      userId: c.user ? String(c.user) : null,
      sourcePath: "telecomChaosAgent.js",
      kind: "orphan_active_call_candidate",
    });
    await persistTelecomChaosSnapshot({
      snapshotType: "orphan_active_call",
      callId: c._id,
      userId: c.user || null,
      hostname: os.hostname(),
      processId: process.pid,
      economicVersion: null,
      callStateVersion: c.status || null,
      timelineHash: "",
      journalHash: "",
      replayHash: "",
      metadata: { lastHeartbeatAt: c.lastHeartbeatAt || null },
    });
  }
  log("info", "orphan_active_scan", { count: rows.length });
}

export const telecomChaosAgent = {
  name: AGENT,
  intervalMs: BASE_MS,
  leaseMs: LEASE_MS,

  async run({ log, ownerId }) {
    const ctx = {
      workerId: ownerId || null,
      hostname: os.hostname(),
      processId: process.pid,
    };
    try {
      if (await detectRecoveryLoopOverlap(log, ownerId)) {
        return { skipped: true, reason: "recovery_overlap" };
      }

      const pressure = getPressureSnapshot();
      const critical = pressure.pressureLevel === "critical";

      if (critical) {
        await detectSplitBrainBillingSignals(ctx).catch((e) =>
          log("warning", "split_brain_scan_failed", { message: e?.message || String(e) })
        );
        await verifyReplayDeterminismSample({ ...ctx, limit: 6 }).catch((e) =>
          log("warning", "replay_verify_failed", { message: e?.message || String(e) })
        );
      } else {
        await Promise.all([
          verifyReplayDeterminismSample({ ...ctx }).catch((e) =>
            log("warning", "replay_verify_failed", { message: e?.message || String(e) })
          ),
          validateTelecomEventOrdering({ ...ctx, callSampleLimit: 12 }).catch((e) =>
            log("warning", "event_order_failed", { message: e?.message || String(e) })
          ),
          detectSplitBrainBillingSignals(ctx).catch((e) =>
            log("warning", "split_brain_scan_failed", { message: e?.message || String(e) })
          ),
          measureWorkerClockDrift(ctx).catch((e) =>
            log("warning", "clock_drift_failed", { message: e?.message || String(e) })
          ),
          sampleEconomicLockHealth(ctx).catch((e) =>
            log("warning", "lock_health_failed", { message: e?.message || String(e) })
          ),
          scanOrphanActiveCalls(log).catch((e) =>
            log("warning", "orphan_scan_failed", { message: e?.message || String(e) })
          ),
        ]);
      }

      chaosStructuredLog("[CHAOS DETECTOR]", {
        sourcePath: "telecomChaosAgent.js",
        kind: "telecom_chaos_pass_complete",
        hostname: os.hostname(),
        pid: process.pid,
      });
      log("info", "telecom_chaos_pass_complete", { critical });
      return { critical };
    } catch (e) {
      log("error", "telecom_chaos_agent_failed", { message: e?.message || String(e) });
      throw e;
    }
  },
};
