import os from "os";
import crypto from "crypto";
import { getRedisClient } from "./cache.service.js";
import { getPressureSnapshot } from "./telecomBackpressureService.js";

const OWNER_ID = `${os.hostname()}:${process.pid}:${crypto.randomBytes(6).toString("hex")}`;

export const CRITICAL_AGENTS = new Set([
  "webhook-integrity-agent",
  "call-lifecycle-agent",
  "billing-consistency-agent",
  "economic-timeline-consistency-agent",
  "economic-recovery-agent",
  "stuck-billing-agent",
  "active-session-reconciliation-agent",
  "ledger-consistency-agent",
  "call-global-reconciliation-job",
  "telecom-chaos-agent",
]);

const LOW_PRIORITY_AGENTS = new Set(["profit-protection-agent", "telecom-health-agent"]);

const PARITY_STYLE_AGENTS = new Set(["live-state-sync-agent"]);

const ANALYTICS_FREQUENCY_AGENTS = new Set(["telecom-health-agent", "profit-protection-agent"]);

/** @type {Map<string, number>} */
const highParityStride = new Map();

/** @type {Map<string, number>} */
const elevatedStride = new Map();

/**
 * Load-aware agent gating (additive). Critical telecom path agents always run.
 * @param {string} agentName
 * @returns {{ skipRun: boolean, reason?: string }}
 */
export function getAgentExecutionPolicy(agentName) {
  const name = String(agentName || "");
  const snap = getPressureSnapshot();
  const level = snap.pressureLevel;

  if (CRITICAL_AGENTS.has(name)) {
    return { skipRun: false };
  }

  if (level === "critical") {
    return { skipRun: true, reason: "critical_non_critical_agent_deferred" };
  }

  if (level === "high" && LOW_PRIORITY_AGENTS.has(name)) {
    return { skipRun: true, reason: "high_tier_low_priority_deferred" };
  }

  if (level === "high" && PARITY_STYLE_AGENTS.has(name)) {
    const n = (highParityStride.get(name) || 0) + 1;
    highParityStride.set(name, n);
    if (n % 2 === 1) {
      return { skipRun: true, reason: "high_parity_stride" };
    }
  }

  if (level === "elevated" && ANALYTICS_FREQUENCY_AGENTS.has(name)) {
    const n = (elevatedStride.get(name) || 0) + 1;
    elevatedStride.set(name, n);
    if (n % 2 === 0) {
      return { skipRun: true, reason: "elevated_analytics_stride" };
    }
  }

  return { skipRun: false };
}

/**
 * Redis-based distributed lease so only one PM2 worker runs heavy agent scans at a time.
 * When Redis is unavailable, returns acquired:true so existing Mongo AgentRuntimeState lease still applies.
 *
 * @param {string} agentName
 * @param {number} [leaseMs]
 * @returns {Promise<{ acquired: boolean, ownerId: string|null, expiresAt: number|null, source: string }>}
 */
export async function claimAgentExecution(agentName, leaseMs = 55_000) {
  const name = String(agentName || "unknown");
  const px = Math.max(5000, Number(leaseMs) || 55_000);
  const client = await getRedisClient();
  if (!client?.isOpen) {
    return {
      acquired: true,
      ownerId: OWNER_ID,
      expiresAt: Date.now() + px,
      source: "memory_fallback",
    };
  }
  const key = `agent:lease:${name}`;
  try {
    const ok = await client.set(key, OWNER_ID, { NX: true, PX: px });
    if (ok !== "OK") {
      return { acquired: false, ownerId: null, expiresAt: null, source: "redis" };
    }
    return { acquired: true, ownerId: OWNER_ID, expiresAt: Date.now() + px, source: "redis" };
  } catch {
    return {
      acquired: true,
      ownerId: OWNER_ID,
      expiresAt: Date.now() + px,
      source: "redis_error_fallback",
    };
  }
}

/**
 * @param {string} agentName
 * @param {string|null} ownerId
 */
export async function releaseAgentExecution(agentName, ownerId) {
  if (!ownerId) return;
  const name = String(agentName || "unknown");
  const client = await getRedisClient();
  if (!client?.isOpen) return;
  const key = `agent:lease:${name}`;
  try {
    const cur = await client.get(key);
    if (cur === ownerId) await client.del(key);
  } catch {
    /* ignore */
  }
}

export function getDistributedAgentOwnerId() {
  return OWNER_ID;
}
