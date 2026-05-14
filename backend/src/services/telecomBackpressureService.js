/**
 * Realtime telecom pressure scoring (in-process signals + optional Redis/Mongo latency hints).
 * Used for load shedding and graceful degradation — never blocks billing/transitions.
 */

import { getRedisClient } from "./cache.service.js";
import mongoose from "mongoose";
import { getHotUserIds } from "./hotUserIsolationService.js";

/** @type {{ ts: number, value: number }[]} */
const webhookWindow = [];
/** @type {{ ts: number, value: number }[]} */
const dupWindow = [];
/** @type {{ ts: number, value: number }[]} */
const emitWindow = [];
/** @type {{ ts: number, value: number }[]} */
const transitionWindow = [];
/** @type {{ ts: number, ms: number }[]} */
const agentDurationWindow = [];

let lastRedisPingMs = null;
let lastMongoPingMs = null;
let lastActiveCallsHint = 0;
let lastBillingTicksHint = 0;
let lastQueueDepthHint = 0;
/** Cross-process (PM2) webhook volume hint: INCR key with ~60s TTL. */
let lastRedisWebhookCluster60s = 0;

const WINDOW_MS = 60_000;
const REDIS_WEBHOOK_CLUSTER_KEY = "telecom:pressure:webhook_cluster_60s";

function trimWindow(arr, now) {
  while (arr.length && now - arr[0].ts > WINDOW_MS) arr.shift();
}

function sumWindow(arr, now) {
  trimWindow(arr, now);
  let s = 0;
  for (const x of arr) s += x.value;
  return s;
}

export function recordWebhookReceived(isDuplicate = false) {
  const now = Date.now();
  webhookWindow.push({ ts: now, value: 1 });
  if (isDuplicate) dupWindow.push({ ts: now, value: 1 });
}

/**
 * Bump cluster-wide webhook counter (shared across workers). Fire-and-forget.
 */
export function bumpRedisWebhookClusterCounter() {
  void (async () => {
    const client = await getRedisClient();
    if (!client?.isOpen) return;
    try {
      const n = await client.incr(REDIS_WEBHOOK_CLUSTER_KEY);
      if (n === 1) await client.expire(REDIS_WEBHOOK_CLUSTER_KEY, 60);
    } catch {
      /* ignore */
    }
  })();
}

export function recordSocketEmit() {
  emitWindow.push({ ts: Date.now(), value: 1 });
}

export function recordCallTransition() {
  transitionWindow.push({ ts: Date.now(), value: 1 });
}

function trimAgentDurationWindow(now) {
  while (agentDurationWindow.length && now - agentDurationWindow[0].ts > WINDOW_MS) agentDurationWindow.shift();
}

export function recordAgentRunDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return;
  const now = Date.now();
  agentDurationWindow.push({ ts: now, ms });
  trimAgentDurationWindow(now);
}

export function setBillingWorkerTickHint(activeCalls, tickMs = 6000) {
  lastActiveCallsHint = Number(activeCalls || 0);
  lastBillingTicksHint = Number(tickMs || 6000);
}

export function setSchedulerQueueDepthHint(depth) {
  lastQueueDepthHint = Math.max(0, Number(depth || 0));
}

async function refreshRedisWebhookClusterHint() {
  const client = await getRedisClient();
  if (!client?.isOpen) {
    lastRedisWebhookCluster60s = 0;
    return;
  }
  try {
    const v = await client.get(REDIS_WEBHOOK_CLUSTER_KEY);
    lastRedisWebhookCluster60s = Math.max(0, Number.parseInt(String(v || "0"), 10) || 0);
  } catch {
    lastRedisWebhookCluster60s = 0;
  }
}

async function refreshLatencyHints() {
  const client = await getRedisClient();
  if (client?.isOpen) {
    const t0 = Date.now();
    try {
      await client.ping();
      lastRedisPingMs = Date.now() - t0;
    } catch {
      lastRedisPingMs = 500;
    }
  } else {
    lastRedisPingMs = null;
  }
  if (mongoose.connection.readyState === 1) {
    const t0 = Date.now();
    try {
      await mongoose.connection.db.adminCommand({ ping: 1 });
      lastMongoPingMs = Date.now() - t0;
    } catch {
      lastMongoPingMs = 200;
    }
  } else {
    lastMongoPingMs = null;
  }
}

/**
 * Synchronous snapshot for hot paths (agents). Uses cached latency hints; call refresh periodically.
 */
export function getPressureSnapshot() {
  const now = Date.now();
  const webhooksLocal = sumWindow(webhookWindow, now);
  const webhooks = Math.max(webhooksLocal, lastRedisWebhookCluster60s);
  const dups = sumWindow(dupWindow, now);
  const emits = sumWindow(emitWindow, now);
  const transitions = sumWindow(transitionWindow, now);
  trimAgentDurationWindow(now);
  let agentP95 = 0;
  if (agentDurationWindow.length) {
    const sorted = agentDurationWindow.map((x) => x.ms).sort((a, b) => a - b);
    agentP95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  }

  const dupRatio = webhooksLocal > 0 ? dups / webhooksLocal : 0;
  const redisScore = lastRedisPingMs == null ? 0 : Math.min(40, lastRedisPingMs / 5);
  const mongoScore = lastMongoPingMs == null ? 0 : Math.min(40, lastMongoPingMs / 4);
  const webhookScore = Math.min(35, webhooks / 25);
  const emitScore = Math.min(30, emits / 40);
  const dupScore = Math.min(25, dupRatio * 80);
  const callScore = Math.min(20, lastActiveCallsHint / 8);
  const agentScore = Math.min(25, agentP95 / 400);
  const queueScore = Math.min(15, lastQueueDepthHint / 50);

  const pressureScore = Math.min(
    100,
    Math.round(
      webhookScore +
        emitScore +
        dupScore +
        callScore +
        agentScore +
        queueScore +
        redisScore +
        mongoScore +
        transitions / 20
    )
  );

  let pressureLevel = "normal";
  let degradedMode = "NORMAL";
  if (pressureScore >= 80) {
    pressureLevel = "critical";
    degradedMode = "CRITICAL";
  } else if (pressureScore >= 55) {
    pressureLevel = "high";
    degradedMode = "HIGH";
  } else if (pressureScore >= 30) {
    pressureLevel = "elevated";
    degradedMode = "ELEVATED";
  }

  const recommendations = [];
  if (dupRatio > 0.35) recommendations.push("investigate_webhook_retry_storm");
  if (emits > 200) recommendations.push("socket_emit_rate_high");
  if (lastRedisPingMs > 40) recommendations.push("redis_latency_elevated");
  if (lastMongoPingMs > 80) recommendations.push("mongo_latency_elevated");
  if (lastActiveCallsHint > 40) recommendations.push("high_concurrent_call_volume");

  return {
    pressureLevel,
    pressureScore,
    degradedMode,
    hotUsers: getHotUserIds(),
    overloadedAgents: agentP95 > 8000 ? [{ hint: "agent_p95_duration_ms", value: agentP95 }] : [],
    recommendations,
    hints: {
      webhooksPer60s: webhooks,
      webhooksLocalPer60s: webhooksLocal,
      redisWebhookCluster60s: lastRedisWebhookCluster60s,
      duplicatesPer60s: dups,
      socketEmitsPer60s: emits,
      transitionsPer60s: transitions,
      activeCallsHint: lastActiveCallsHint,
      redisPingMs: lastRedisPingMs,
      mongoPingMs: lastMongoPingMs,
      queueDepthHint: lastQueueDepthHint,
    },
  };
}

export async function computeTelecomPressure() {
  await refreshLatencyHints();
  await refreshRedisWebhookClusterHint();
  return getPressureSnapshot();
}
