import mongoose from "mongoose";
import User from "../models/User.js";
import Call from "../models/Call.js";
import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";
import BillingEventJournal from "../models/BillingEventJournal.js";
import CreditLedger from "../models/CreditLedger.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import TelecomChaosSnapshot from "../models/TelecomChaosSnapshot.js";
import AgentRuntimeState from "../models/AgentRuntimeState.js";
import SubscriptionActivationFailure from "../models/SubscriptionActivationFailure.js";
import StripeInvoice from "../models/StripeInvoice.js";
import ProcessedWebhookEvent from "../models/ProcessedWebhookEvent.js";
import { getRedisClient } from "./cache.service.js";
import { TERMINAL_STATUSES, ACTIVE_CALL_STATUSES } from "../utils/callStateMachine.js";
import { aggregateWebhookLatencyFromDb } from "./webhookLatencyService.js";
import { listWorkerHeartbeats } from "./workerHeartbeatService.js";
import { detectSplitBrainBillingSignals } from "./splitBrainBillingDetector.js";
import ProfitEvent from "../models/ProfitEvent.js";
import { CRITICAL_AGENTS } from "./distributedAgentCoordinator.js";
import { telecomOperationalLog } from "../utils/telecomOperationalLog.js";
import { getDeploymentMode } from "./deploymentModeService.js";

const SEVERITY_ORDER = { healthy: 0, warning: 1, critical: 2 };

function maxSeverity(a, b) {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

async function safeCount(model, filter = {}, limitMs = 8000) {
  const q = model.countDocuments(filter).maxTimeMS(limitMs);
  try {
    return await q;
  } catch {
    return null;
  }
}

async function loadIndexes(collection) {
  try {
    return await collection.listIndexes().toArray();
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

function hasUniqueField(indexes, field) {
  if (!Array.isArray(indexes)) return false;
  return indexes.some((ix) => ix.unique && ix.key && ix.key[field]);
}

async function mongoSupportsTransactions() {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    await session.endSession();
  }
}

async function replicaSetHello() {
  try {
    const db = mongoose.connection?.db;
    if (!db) return { ok: false, error: "no_db" };
    const hello = await db.admin().command({ hello: 1 });
    return { ok: true, setName: hello.setName || null, isWritablePrimary: hello.isWritablePrimary ?? null };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Production / deploy gate checks (read-only, bounded scans).
 * @param {{ fullIndexAudit?: boolean, logTag?: string }} [opts]
 */
export async function runProductionReadinessChecks(opts = {}) {
  const fullIndexAudit = opts.fullIndexAudit !== false;
  const deploymentMode = getDeploymentMode();
  const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const since1h = new Date(Date.now() - 3600 * 1000);

  const sections = {
    database: { status: "healthy", details: {} },
    billing: { status: "healthy", details: {} },
    stripe: { status: "healthy", details: {} },
    telnyx: { status: "healthy", details: {} },
    agents: { status: "healthy", details: {} },
  };

  let overall = "healthy";

  // ---------- A. DATABASE ----------
  const dbDetails = {
    mongoReadyState: mongoose.connection.readyState,
    redisConfigured: Boolean(String(process.env.REDIS_URL || "").trim()),
    redisPingOk: null,
    journalCreditLedgerAccessible: null,
    journalBillingEventAccessible: null,
    journalEconomicTimelineAccessible: null,
    indexes: {},
    replicaSetHello: null,
    transactionsSupported: null,
  };

  if (mongoose.connection.readyState !== 1) {
    dbDetails.mongoConnected = false;
    sections.database.status = "critical";
    overall = maxSeverity(overall, "critical");
  } else {
    dbDetails.mongoConnected = true;
    try {
      await mongoose.connection.db.admin().ping();
    } catch (e) {
      dbDetails.mongoPingError = e?.message || String(e);
      sections.database.status = "critical";
      overall = maxSeverity(overall, "critical");
    }

    dbDetails.journalCreditLedgerAccessible = await safeCount(CreditLedger, {}, 6000) != null;
    dbDetails.journalBillingEventAccessible = await safeCount(BillingEventJournal, {}, 6000) != null;
    dbDetails.journalEconomicTimelineAccessible = await safeCount(EconomicTimeline, {}, 6000) != null;

    if (
      dbDetails.journalCreditLedgerAccessible === false ||
      dbDetails.journalBillingEventAccessible === false ||
      dbDetails.journalEconomicTimelineAccessible === false
    ) {
      sections.database.status = "critical";
      overall = maxSeverity(overall, "critical");
    }

    if (fullIndexAudit) {
      const [clIx, bejIx, etIx] = await Promise.all([
        loadIndexes(CreditLedger.collection),
        loadIndexes(BillingEventJournal.collection),
        loadIndexes(EconomicTimeline.collection),
      ]);
      dbDetails.indexes.creditLedger = Array.isArray(clIx) ? { idempotencyKeyUnique: hasUniqueField(clIx, "idempotencyKey") } : { error: clIx?.error || "list_failed" };
      dbDetails.indexes.billingEventJournal = Array.isArray(bejIx)
        ? { eventIdUnique: hasUniqueField(bejIx, "eventId") }
        : { error: bejIx?.error || "list_failed" };
      dbDetails.indexes.economicTimeline = Array.isArray(etIx)
        ? { callIdUnique: hasUniqueField(etIx, "callId") }
        : { error: etIx?.error || "list_failed" };

      if (!dbDetails.indexes.creditLedger?.idempotencyKeyUnique) {
        sections.database.status = maxSeverity(sections.database.status, "critical");
        overall = maxSeverity(overall, "critical");
      }
      if (!dbDetails.indexes.billingEventJournal?.eventIdUnique) {
        sections.database.status = maxSeverity(sections.database.status, "critical");
        overall = maxSeverity(overall, "critical");
      }
      if (!dbDetails.indexes.economicTimeline?.callIdUnique) {
        sections.database.status = maxSeverity(sections.database.status, "warning");
        overall = maxSeverity(overall, "warning");
      }
    }

    dbDetails.replicaSetHello = await replicaSetHello();
    if (!dbDetails.replicaSetHello?.setName) {
      sections.database.status = maxSeverity(sections.database.status, "warning");
      overall = maxSeverity(overall, "warning");
    }

    dbDetails.transactionsSupported = await mongoSupportsTransactions();
    if (!dbDetails.transactionsSupported.ok) {
      sections.database.status = maxSeverity(sections.database.status, "warning");
      overall = maxSeverity(overall, "warning");
    }
  }

  const redisClient = await getRedisClient();
  if (dbDetails.redisConfigured) {
    if (!redisClient?.isOpen) {
      dbDetails.redisPingOk = false;
      sections.database.status = maxSeverity(sections.database.status, "warning");
      overall = maxSeverity(overall, "warning");
    } else {
      try {
        const t0 = Date.now();
        await redisClient.ping();
        dbDetails.redisPingOk = true;
        dbDetails.redisPingMs = Date.now() - t0;
      } catch {
        dbDetails.redisPingOk = false;
        sections.database.status = maxSeverity(sections.database.status, "warning");
        overall = maxSeverity(overall, "warning");
      }
    }
  } else {
    dbDetails.redisPingOk = null;
    sections.database.status = maxSeverity(sections.database.status, "warning");
    overall = maxSeverity(overall, "warning");
  }

  sections.database.details = dbDetails;

  // ---------- B. BILLING ----------
  const billingDetails = {};
  if (mongoose.connection.readyState === 1) {
    billingDetails.negativeBalanceUsers = await safeCount(User, { remainingCredits: { $lt: 0 } });
    billingDetails.reservedExceedsRemainingUsers = await safeCount(User, {
      $expr: { $gt: ["$reservedCredits", "$remainingCredits"] },
    });

    billingDetails.orphanReservationTimelines = await safeCount(EconomicTimeline, {
      timelineState: { $in: ["reserved", "charging"] },
      updatedAt: { $lt: new Date(Date.now() - 2 * 3600 * 1000) },
    });

    billingDetails.terminalCallsWithHeldReservation = await safeCount(Call, {
      status: { $in: TERMINAL_STATUSES },
      creditReservationHeld: { $gt: 0 },
      creditReservationReleasedAt: null,
    });

    billingDetails.intervalDriftSnapshots24h = await safeCount(TelecomChaosSnapshot, {
      snapshotType: { $in: ["billing_divergence", "clock_drift_detected", "duplicate_interval_detected"] },
      createdAt: { $gte: since24h },
    });

    billingDetails.replayDivergence24h = await safeCount(TelecomChaosSnapshot, {
      snapshotType: "replay_divergence",
      createdAt: { $gte: since24h },
    });

    billingDetails.splitBrain24h = await safeCount(TelecomChaosSnapshot, {
      snapshotType: "split_brain_detected",
      createdAt: { $gte: since24h },
    });

    billingDetails.economicLockStarvation24h = await safeCount(ProfitEvent, {
      eventType: "economic_lock_starvation",
      timestamp: { $gte: since24h },
    });

    billingDetails.duplicateInterval24h = await safeCount(TelecomChaosSnapshot, {
      snapshotType: "duplicate_interval_detected",
      createdAt: { $gte: since24h },
    });

    const split = await detectSplitBrainBillingSignals({}).catch(() => ({ suspiciousPairs: [] }));
    billingDetails.splitBrainDetectorPairs = Array.isArray(split?.suspiciousPairs) ? split.suspiciousPairs.length : null;

    if ((billingDetails.negativeBalanceUsers || 0) > 0) {
      sections.billing.status = "critical";
      overall = maxSeverity(overall, "critical");
    }
    if ((billingDetails.reservedExceedsRemainingUsers || 0) > 0) {
      sections.billing.status = maxSeverity(sections.billing.status, "critical");
      overall = maxSeverity(overall, "critical");
    }
    if ((billingDetails.terminalCallsWithHeldReservation || 0) > 0) {
      sections.billing.status = maxSeverity(sections.billing.status, "critical");
      overall = maxSeverity(overall, "critical");
    }
    if ((billingDetails.replayDivergence24h || 0) > 3 || (billingDetails.duplicateInterval24h || 0) > 2) {
      sections.billing.status = maxSeverity(sections.billing.status, "warning");
      overall = maxSeverity(overall, "warning");
    }
    if ((billingDetails.economicLockStarvation24h || 0) > 0) {
      sections.billing.status = maxSeverity(sections.billing.status, "warning");
      overall = maxSeverity(overall, "warning");
    }
  }
  sections.billing.details = billingDetails;

  // ---------- C. STRIPE ----------
  const stripeDetails = {
    stripeSecretConfigured: Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim()),
    stripeWebhookSecretConfigured: Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || "").trim()),
    activePlansMissingStripe: null,
    activeAddonsMissingStripe: null,
    activationFailures1h: null,
    invoiceDuplicateGroups: null,
  };
  if (mongoose.connection.readyState === 1) {
    stripeDetails.activePlansMissingStripe = await safeCount(Plan, {
      active: true,
      $or: [{ stripePriceId: { $in: [null, ""] } }, { stripeProductId: { $in: [null, ""] } }],
    });
    stripeDetails.activeAddonsMissingStripe = await safeCount(AddonPlan, {
      active: true,
      $or: [{ stripePriceId: { $in: [null, ""] } }],
    });
    stripeDetails.activationFailures1h = await safeCount(SubscriptionActivationFailure, {
      createdAt: { $gte: since1h },
      status: "open",
    });

    try {
      const dups = await StripeInvoice.aggregate([
        { $match: { checkoutSessionId: { $ne: null } } },
        { $group: { _id: "$checkoutSessionId", c: { $sum: 1 } } },
        { $match: { c: { $gt: 1 } } },
        { $limit: 20 },
      ]).option({ maxTimeMS: 10000 });
      stripeDetails.invoiceDuplicateGroups = Array.isArray(dups) ? dups.length : null;
    } catch {
      stripeDetails.invoiceDuplicateGroups = null;
    }
  }

  if (!stripeDetails.stripeSecretConfigured || !stripeDetails.stripeWebhookSecretConfigured) {
    sections.stripe.status = isProd ? "critical" : "warning";
    overall = maxSeverity(overall, sections.stripe.status);
  }
  if ((stripeDetails.activePlansMissingStripe || 0) > 0 || (stripeDetails.activeAddonsMissingStripe || 0) > 0) {
    sections.stripe.status = maxSeverity(sections.stripe.status, "warning");
    overall = maxSeverity(overall, "warning");
  }
  if ((stripeDetails.activationFailures1h || 0) > 5) {
    sections.stripe.status = maxSeverity(sections.stripe.status, "warning");
    overall = maxSeverity(overall, "warning");
  }
  if ((stripeDetails.invoiceDuplicateGroups || 0) > 0) {
    sections.stripe.status = maxSeverity(sections.stripe.status, "warning");
    overall = maxSeverity(overall, "warning");
  }
  sections.stripe.details = stripeDetails;

  // ---------- D. TELNYX ----------
  const telnyxDetails = {
    apiKeyConfigured: Boolean(String(process.env.TELNYX_API_KEY || "").trim()),
    sipConnectionConfigured: Boolean(
      String(process.env.TELNYX_CONNECTION_ID || "").trim() || String(process.env.TELNYX_TELEPHONY_CREDENTIAL_ID || "").trim()
    ),
    activeOutboundCalls: mongoose.connection.readyState === 1 ? await safeCount(Call, { direction: "outbound", status: { $in: ACTIVE_CALL_STATUSES } }) : null,
    staleActiveCalls: null,
    webhookLatency1h: null,
    webhookDuplicateSamples1h: null,
  };
  if (mongoose.connection.readyState === 1) {
    const staleCut = new Date(Date.now() - Number(process.env.READINESS_STALE_CALL_MS || 3 * 3600 * 1000));
    telnyxDetails.staleActiveCalls = await safeCount(Call, {
      status: { $in: ACTIVE_CALL_STATUSES },
      updatedAt: { $lt: staleCut },
    });
    try {
      telnyxDetails.webhookLatency1h = await aggregateWebhookLatencyFromDb(3600000);
    } catch {
      telnyxDetails.webhookLatency1h = null;
    }
    telnyxDetails.webhookDuplicateSamples1h = await safeCount(ProcessedWebhookEvent, {
      duplicateCount: { $gt: 0 },
      lastDuplicateAt: { $gte: since1h },
    });
  }
  if (!telnyxDetails.apiKeyConfigured || !telnyxDetails.sipConnectionConfigured) {
    sections.telnyx.status = isProd ? "critical" : "warning";
    overall = maxSeverity(overall, sections.telnyx.status);
  }
  if ((telnyxDetails.staleActiveCalls || 0) > 0) {
    sections.telnyx.status = maxSeverity(sections.telnyx.status, "warning");
    overall = maxSeverity(overall, "warning");
  }
  sections.telnyx.details = telnyxDetails;

  // ---------- E. AGENTS ----------
  const agentDetails = { criticalAgents: [], workerHeartbeats: null, oldestCriticalHeartbeatAgeSec: null };
  const hb = await listWorkerHeartbeats();
  agentDetails.workerHeartbeats = hb;

  if (mongoose.connection.readyState === 1) {
    const agents = await AgentRuntimeState.find({ agent: { $in: [...CRITICAL_AGENTS] } })
      .select("agent status heartbeatAt lastRunAt lastError")
      .lean()
      .catch(() => []);
    const now = Date.now();
    const maxStaleSec = Number(process.env.READINESS_AGENT_HEARTBEAT_MAX_SEC || 1200);
    for (const name of CRITICAL_AGENTS) {
      const row = agents.find((a) => a.agent === name) || null;
      const ageSec = row?.heartbeatAt ? Math.floor((now - new Date(row.heartbeatAt).getTime()) / 1000) : null;
      const unhealthy = !row || row.status === "failed" || row.status === "stopped" || (ageSec != null && ageSec > maxStaleSec);
      agentDetails.criticalAgents.push({
        agent: name,
        status: row?.status || "missing",
        heartbeatAgeSec: ageSec,
        lastRunAt: row?.lastRunAt || null,
        lastError: row?.lastError || null,
        unhealthy,
      });
      if (unhealthy) {
        agentDetails.oldestCriticalHeartbeatAgeSec =
          ageSec == null ? agentDetails.oldestCriticalHeartbeatAgeSec : Math.max(agentDetails.oldestCriticalHeartbeatAgeSec || 0, ageSec);
      }
    }
    if (agentDetails.criticalAgents.some((a) => a.unhealthy)) {
      sections.agents.status = maxSeverity(sections.agents.status, isProd ? "critical" : "warning");
      overall = maxSeverity(overall, sections.agents.status);
    }
  }

  sections.agents.details = agentDetails;

  const result = {
    overall,
    deploymentMode,
    checkedAt: new Date().toISOString(),
    sections,
  };

  if (!opts.silent) {
    telecomOperationalLog(opts.logTag || "[STARTUP CHECK]", {
      overall,
      deploymentMode,
      database: sections.database.status,
      billing: sections.billing.status,
      stripe: sections.stripe.status,
      telnyx: sections.telnyx.status,
      agents: sections.agents.status,
    });
  }

  return result;
}
