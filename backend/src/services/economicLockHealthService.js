/**
 * Economic lock health (Redis lock:economic:* sampling). Read-only forensics.
 */

import os from "os";
import Call from "../models/Call.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import ProfitEvent from "../models/ProfitEvent.js";
import { getRedisClient } from "./cache.service.js";
import { ACTIVE_CALL_STATUSES } from "../utils/callStateMachine.js";
import { persistTelecomChaosSnapshot } from "./chaosSnapshotService.js";
import { chaosStructuredLog } from "../utils/chaosStructuredLog.js";

const ECON_LOCK_PREFIX = "lock:economic:";
const STALE_LAST_EVENT_MS = Math.max(60_000, Number(process.env.CHAOS_STALE_ECON_LOCK_MS || 300_000));

/**
 * @returns {Promise<{ sampled: number, staleLocks: number }>}
 */
export async function sampleEconomicLockHealth(opts = {}) {
  const client = await getRedisClient();
  if (!client?.isOpen) {
    return { sampled: 0, staleLocks: 0, redis: false };
  }
  const n = Math.min(40, Math.max(5, Number(opts.sampleCalls || 20)));
  const calls = await Call.find({ status: { $in: ACTIVE_CALL_STATUSES } })
    .sort({ updatedAt: -1 })
    .limit(n)
    .select("_id user updatedAt")
    .lean()
    .catch(() => []);

  let staleLocks = 0;
  for (const c of calls) {
    const key = `${ECON_LOCK_PREFIX}${c._id}`;
    let pttl = -2;
    try {
      pttl = await client.pttl(key);
    } catch {
      pttl = -2;
    }
    if (pttl <= 0) continue;
    const tl = await EconomicTimeline.findOne({ callId: c._id }).select("lastEconomicEventAt user economicVersion consistencyHash").lean();
    const last = tl?.lastEconomicEventAt ? new Date(tl.lastEconomicEventAt).getTime() : 0;
    if (last && Date.now() - last > STALE_LAST_EVENT_MS) {
      staleLocks += 1;
      chaosStructuredLog("[LOCK HEALTH]", {
        callId: String(c._id),
        userId: c.user ? String(c.user) : null,
        economicVersion: tl?.economicVersion ?? null,
        timelineHash: tl?.consistencyHash || "",
        sourcePath: "economicLockHealthService.js",
        redisPttlMs: pttl,
      });
      await persistTelecomChaosSnapshot({
        snapshotType: "stale_lock_detected",
        callId: c._id,
        userId: tl?.user || c.user || null,
        workerId: opts.workerId || null,
        hostname: opts.hostname || os.hostname(),
        processId: opts.processId ?? process.pid,
        economicVersion: tl?.economicVersion ?? null,
        callStateVersion: null,
        timelineHash: tl?.consistencyHash || "",
        journalHash: "",
        replayHash: "",
        metadata: { redisPttlMs: pttl, lastEconomicEventAt: tl?.lastEconomicEventAt || null },
      });
      await ProfitEvent.create({
        userId: tl?.user || c.user || undefined,
        eventType: "economic_lock_starvation",
        severity: "warning",
        payload: { callId: String(c._id), redisPttlMs: pttl },
        timestamp: new Date(),
      }).catch(() => {});
    }
  }

  return { sampled: calls.length, staleLocks, redis: true };
}
