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
import { profitProtectionAgent } from "./telecom/profitProtectionAgent.js";
import { ledgerConsistencyAgent } from "./telecom/ledgerConsistencyAgent.js";
import { billingConsistencyAgent } from "./telecom/billingConsistencyAgent.js";
import { economicTimelineConsistencyAgent } from "./telecom/economicTimelineConsistencyAgent.js";
import { economicRecoveryAgent } from "./telecom/economicRecoveryAgent.js";
import { stuckBillingAgent } from "./telecom/stuckBillingAgent.js";
import { activeSessionReconciliationAgent } from "./telecom/activeSessionReconciliationAgent.js";
import { telecomChaosAgent } from "./telecom/telecomChaosAgent.js";
import { agentLog, compactError } from "./shared/agentLogger.js";
import { claimAgentExecution, releaseAgentExecution, getAgentExecutionPolicy } from "../services/distributedAgentCoordinator.js";
import { recordAgentRunDurationMs } from "../services/telecomBackpressureService.js";
import { scheduleTelecomTask, TELECOM_PRIORITY } from "../services/telecomPriorityScheduler.js";

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
  profitProtectionAgent,
  ledgerConsistencyAgent,
  billingConsistencyAgent,
  economicTimelineConsistencyAgent,
  economicRecoveryAgent,
  stuckBillingAgent,
  activeSessionReconciliationAgent,
  telecomChaosAgent,
];

let started = false;
let stopped = false;
const timers = new Map();

/** @type {Record<string, string>} */
const AGENT_TELECOM_PRIORITY = {
  "telecom-health-agent": TELECOM_PRIORITY.LOW,
  "profit-protection-agent": TELECOM_PRIORITY.LOW,
  "deployment-safety-agent": TELECOM_PRIORITY.MEDIUM,
  "live-state-sync-agent": TELECOM_PRIORITY.HIGH,
  "multi-tenant-isolation-agent": TELECOM_PRIORITY.HIGH,
  "queue-recovery-agent": TELECOM_PRIORITY.HIGH,
  "telecom-chaos-agent": TELECOM_PRIORITY.CRITICAL,
};

function telecomPriorityForAgent(name) {
  return AGENT_TELECOM_PRIORITY[name] || TELECOM_PRIORITY.CRITICAL;
}

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
  const policy = getAgentExecutionPolicy(agent.name);
  if (policy.skipRun) {
    return;
  }
  const coordLeaseMs = Number(agent.leaseMs || DEFAULT_LEASE_MS);
  const coord = await claimAgentExecution(agent.name, coordLeaseMs);
  if (!coord.acquired) return;
  try {
    const hasLease = await acquireLease(agent);
    if (!hasLease) return;

    const startedAt = Date.now();
    const ctx = {
      ownerId: OWNER_ID,
      log: (severity, event, details = {}) => agentLog(agent.name, severity, event, details),
    };
    const prio = telecomPriorityForAgent(agent.name);
    const scheduled = await scheduleTelecomTask(prio, () => agent.run(ctx));
    if (!scheduled.ok && scheduled.dropped) {
      await markAgent(agent, {
        status: "healthy",
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + Number(agent.intervalMs || 60_000)),
        lastError: null,
        metrics: { durationMs: Date.now() - startedAt, telecomTaskDropped: true },
      });
      recordAgentRunDurationMs(Date.now() - startedAt);
      return;
    }
    if (!scheduled.ok) {
      throw new Error(scheduled.error || "telecom_task_failed");
    }
    const metrics = scheduled.result;
    await markAgent(agent, {
      status: "healthy",
      lastRunAt: new Date(),
      nextRunAt: new Date(Date.now() + Number(agent.intervalMs || 60_000)),
      lastError: null,
      metrics: { ...(metrics || {}), durationMs: Date.now() - startedAt },
    });
    recordAgentRunDurationMs(Date.now() - startedAt);
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
  } finally {
    if (coord.source === "redis") {
      await releaseAgentExecution(agent.name, coord.ownerId).catch(() => {});
    }
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
