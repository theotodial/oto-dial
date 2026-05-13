import os from "os";
import crypto from "crypto";
import AgentRuntimeState from "../models/AgentRuntimeState.js";
import { telecomHealthAgent } from "./telecom/telecomHealthAgent.js";
import { multiTenantIsolationAgent } from "./isolation/multiTenantIsolationAgent.js";
import { queueRecoveryAgent } from "./queue/queueRecoveryAgent.js";
import { webhookIntegrityAgent } from "./webhooks/webhookIntegrityAgent.js";
import { callLifecycleAgent } from "./calls/callLifecycleAgent.js";
import { callGlobalReconciliationJob } from "./calls/callGlobalReconciliationJob.js";
import { liveStateSyncAgent } from "./sync/liveStateSyncAgent.js";
import { deploymentSafetyAgent } from "./deployment/deploymentSafetyAgent.js";
import { agentLog, compactError } from "./shared/agentLogger.js";

const DEFAULT_LEASE_MS = 55_000;
const OWNER_ID = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;
const registeredAgents = [
  telecomHealthAgent,
  multiTenantIsolationAgent,
  queueRecoveryAgent,
  webhookIntegrityAgent,
  callLifecycleAgent,
  callGlobalReconciliationJob,
  liveStateSyncAgent,
  deploymentSafetyAgent,
];

let started = false;
let stopped = false;
const timers = new Map();

function isDisabled() {
  return String(process.env.PRODUCTION_AGENTS_ENABLED || "true").trim().toLowerCase() === "false";
}

async function acquireLease(agent) {
  const now = new Date();
  const leaseUntil = new Date(Date.now() + Number(agent.leaseMs || DEFAULT_LEASE_MS));
  try {
    const state = await AgentRuntimeState.findOneAndUpdate(
      {
        agent: agent.name,
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: null },
          { leaseUntil: { $lte: now } },
          { ownerId: OWNER_ID },
        ],
      },
      {
        $set: {
          ownerId: OWNER_ID,
          status: "running",
          heartbeatAt: now,
          leaseUntil,
        },
        $setOnInsert: { restartCount: 0 },
      },
      { upsert: true, new: true }
    );
    return state?.ownerId === OWNER_ID;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function markAgent(agent, patch) {
  await AgentRuntimeState.findOneAndUpdate(
    { agent: agent.name },
    {
      $set: {
        ownerId: OWNER_ID,
        heartbeatAt: new Date(),
        ...patch,
      },
    },
    { upsert: true }
  ).catch((error) => {
    agentLog("agent-runtime", "warning", "state_update_failed", {
      agent: agent.name,
      error: compactError(error),
    });
  });
}

async function runAgent(agent) {
  if (stopped) return;
  try {
    const hasLease = await acquireLease(agent);
    if (!hasLease) return;

    const startedAt = Date.now();
    const metrics = await agent.run({
      ownerId: OWNER_ID,
      log: (severity, event, details = {}) => agentLog(agent.name, severity, event, details),
    });
    await markAgent(agent, {
      status: "healthy",
      lastRunAt: new Date(),
      nextRunAt: new Date(Date.now() + Number(agent.intervalMs || 60_000)),
      lastError: null,
      metrics: { ...(metrics || {}), durationMs: Date.now() - startedAt },
    });
  } catch (error) {
    await AgentRuntimeState.findOneAndUpdate(
      { agent: agent.name },
      {
        $set: {
          ownerId: OWNER_ID,
          status: "failed",
          heartbeatAt: new Date(),
          lastRunAt: new Date(),
          lastError: compactError(error),
          leaseUntil: new Date(Date.now() + Math.min(Number(agent.intervalMs || 60_000), 60_000)),
        },
        $inc: { restartCount: 1 },
      },
      { upsert: true }
    ).catch(() => {});
    agentLog(agent.name, "error", "agent_run_failed", { error: compactError(error) });
  }
}

function scheduleAgent(agent) {
  const intervalMs = Math.max(10_000, Number(agent.intervalMs || 60_000));
  void runAgent(agent);
  const timer = setInterval(() => {
    void runAgent(agent);
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  timers.set(agent.name, timer);
}

export function startAgentRuntime() {
  if (started || isDisabled()) {
    if (isDisabled()) {
      agentLog("agent-runtime", "warning", "agents_disabled", {});
    }
    return;
  }
  started = true;
  stopped = false;
  for (const agent of registeredAgents) {
    scheduleAgent(agent);
  }
  agentLog("agent-runtime", "info", "started", {
    ownerId: OWNER_ID,
    agents: registeredAgents.map((agent) => agent.name),
  });
}

export async function stopAgentRuntime() {
  stopped = true;
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
  await AgentRuntimeState.updateMany(
    { ownerId: OWNER_ID },
    { $set: { status: "stopped", leaseUntil: new Date(), heartbeatAt: new Date() } }
  ).catch(() => {});
  agentLog("agent-runtime", "info", "stopped", { ownerId: OWNER_ID });
}

export async function getAgentRuntimeSnapshot() {
  const states = await AgentRuntimeState.find({}).sort({ agent: 1 }).lean();
  return {
    ownerId: OWNER_ID,
    agents: states.map((state) => ({
      agent: state.agent,
      status: state.status,
      ownerId: state.ownerId,
      heartbeatAt: state.heartbeatAt,
      lastRunAt: state.lastRunAt,
      nextRunAt: state.nextRunAt,
      lastError: state.lastError,
      restartCount: state.restartCount,
      metrics: state.metrics || {},
    })),
  };
}
