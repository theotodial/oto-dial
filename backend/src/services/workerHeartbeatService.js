/**
 * Worker heartbeat in Redis (TTL). Used for dead / ghost worker hints in chaos forensics.
 */

import os from "os";
import process from "node:process";
import Call from "../models/Call.js";
import { getRedisClient } from "./cache.service.js";
import { telecomStructuredLog } from "../utils/telecomStructuredLog.js";
import { ACTIVE_CALL_STATUSES } from "../utils/callStateMachine.js";

const HB_PREFIX = "chaos:worker:hb:";
const DEFAULT_TTL_SEC = Math.max(30, Number(process.env.WORKER_HEARTBEAT_TTL_SEC || 90));

export function buildDefaultWorkerId() {
  return `${os.hostname()}:${process.pid}`;
}

/**
 * @param {object} [extra]
 * @param {string} [extra.workerId]
 */
export async function publishWorkerHeartbeat(extra = {}) {
  const client = await getRedisClient();
  if (!client?.isOpen) return { ok: false, reason: "redis_unavailable" };
  const workerId = String(extra.workerId || buildDefaultWorkerId());
  const mem = process.memoryUsage();
  let activeCalls = null;
  try {
    activeCalls = await Call.countDocuments({ status: { $in: ACTIVE_CALL_STATUSES } });
  } catch {
    activeCalls = null;
  }
  const payload = {
    workerId,
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: extra.startedAt || new Date().toISOString(),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    uptimeSec: Math.floor(process.uptime()),
    activeCalls,
    activeEconomicLocksHint: extra.activeEconomicLocksHint ?? null,
    billingQueueHint: extra.billingQueueHint ?? null,
    at: new Date().toISOString(),
  };
  try {
    await client.set(`${HB_PREFIX}${workerId}`, JSON.stringify(payload), { EX: DEFAULT_TTL_SEC });
    telecomStructuredLog("[WORKER HEARTBEAT]", {
      sourcePath: "workerHeartbeatService.js",
      workerId,
      hostname: payload.hostname,
      pid: payload.pid,
      activeCalls: payload.activeCalls,
    });
    return { ok: true, workerId };
  } catch {
    return { ok: false, reason: "redis_set_failed" };
  }
}

export async function listWorkerHeartbeats() {
  const client = await getRedisClient();
  if (!client?.isOpen) return { ok: false, workers: [], reason: "redis_unavailable" };
  const workers = [];
  try {
    for await (const key of client.scanIterator({ MATCH: `${HB_PREFIX}*`, COUNT: 40 })) {
      const raw = await client.get(key);
      if (!raw) continue;
      try {
        workers.push(JSON.parse(raw));
      } catch {
        workers.push({ workerId: String(key).replace(HB_PREFIX, ""), parseError: true });
      }
    }
  } catch {
    return { ok: false, workers: [], reason: "scan_failed" };
  }
  return { ok: true, workers };
}

/** Placeholder for future lock-holder vs heartbeat correlation (read-only). */
export async function detectGhostWorkerLocks() {
  const heartbeats = await listWorkerHeartbeats();
  const alive = new Set((heartbeats.workers || []).map((w) => w.workerId).filter(Boolean));
  return { ok: true, aliveWorkers: [...alive] };
}

export function startWorkerHeartbeatPublisher(extra = {}) {
  const period = Math.max(15_000, Number(process.env.WORKER_HEARTBEAT_PERIOD_MS || 30_000));
  void publishWorkerHeartbeat(extra);
  const t = setInterval(() => {
    void publishWorkerHeartbeat(extra);
  }, period);
  if (typeof t.unref === "function") t.unref();
  return t;
}
