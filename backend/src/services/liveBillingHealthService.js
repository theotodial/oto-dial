import Call from "../models/Call.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import CreditLedger from "../models/CreditLedger.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import TelecomChaosSnapshot from "../models/TelecomChaosSnapshot.js";
import ProfitEvent from "../models/ProfitEvent.js";
import ProcessedWebhookEvent from "../models/ProcessedWebhookEvent.js";
import { ACTIVE_CALL_STATUSES, TERMINAL_STATUSES } from "../utils/callStateMachine.js";
import { getPressureSnapshot } from "./telecomBackpressureService.js";
import { getPerformanceTelemetryQuickSnapshot, getLatestPerformanceHealthFromDb } from "./performanceTelemetryService.js";
import { getWebhookBurstStats } from "./webhookBurstProtectionService.js";
import { aggregateWebhookLatencyFromDb } from "./webhookLatencyService.js";
import { getDeploymentMode } from "./deploymentModeService.js";

async function safeCount(model, filter, ms = 8000) {
  try {
    return await model.countDocuments(filter).maxTimeMS(ms);
  } catch {
    return null;
  }
}

async function sumReservedCredits() {
  try {
    const [row] = await User.aggregate([
      { $match: { reservedCredits: { $gt: 0 } } },
      { $group: { _id: null, t: { $sum: "$reservedCredits" } } },
    ]).option({ maxTimeMS: 12000 });
    return row?.t ?? 0;
  } catch {
    return null;
  }
}

async function countNegativeSubscriptionBalances() {
  try {
    return await Subscription.countDocuments({ remainingCredits: { $lt: 0 } }).maxTimeMS(8000);
  } catch {
    return null;
  }
}

/**
 * Admin dashboard payload (bounded, read-only).
 */
export async function getLiveBillingHealthSnapshot() {
  const since1m = new Date(Date.now() - 60_000);
  const since15m = new Date(Date.now() - 15 * 60_000);
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);

  const pressure = getPressureSnapshot();
  const perfQuick = getPerformanceTelemetryQuickSnapshot();
  const burst = getWebhookBurstStats();
  const latestPerf = await getLatestPerformanceHealthFromDb().catch(() => null);
  const webhookAgg = await aggregateWebhookLatencyFromDb(3600000).catch(() => null);

  let activeBillingCallIds = [];
  try {
    activeBillingCallIds = await Call.find({ status: { $in: ["answered", "in-progress"] } })
      .select("_id")
      .limit(400)
      .lean()
      .then((rows) => rows.map((r) => r._id));
  } catch {
    activeBillingCallIds = [];
  }

  let projectedExposure = null;
  if (activeBillingCallIds.length) {
    try {
      const [row] = await EconomicTimeline.aggregate([
        { $match: { callId: { $in: activeBillingCallIds }, finalizedAt: null } },
        {
          $group: {
            _id: null,
            exposure: {
              $sum: {
                $max: [
                  0,
                  { $subtract: [{ $ifNull: ["$reservedCredits", 0] }, { $ifNull: ["$releasedCredits", 0] }] },
                ],
              },
            },
          },
        },
      ]).option({ maxTimeMS: 12000 });
      projectedExposure = row?.exposure ?? 0;
    } catch {
      projectedExposure = null;
    }
  } else {
    projectedExposure = 0;
  }

  const [
    activeCalls,
    billingNow,
    reservedTotal,
    intervalCharges1m,
    dupPrevention1m,
    negUsers,
    negSubs,
    unreleasedTerminal,
    replayDiv24h,
    billingFailures15m,
    recoveryRuns1m,
    recoveryAttempts15m,
    staleRepairs24h,
    stuckSessions24h,
    lockStarvation24h,
    splitBrain24h,
    dupInterval24h,
  ] = await Promise.all([
    safeCount(Call, { status: { $in: ACTIVE_CALL_STATUSES } }),
    safeCount(Call, { status: { $in: ["answered", "in-progress"] } }),
    sumReservedCredits(),
    safeCount(CreditLedger, { type: "connected_duration_charge", createdAt: { $gte: since1m } }),
    safeCount(ProcessedWebhookEvent, { duplicateCount: { $gt: 0 }, lastDuplicateAt: { $gte: since1m } }),
    safeCount(User, { remainingCredits: { $lt: 0 } }),
    countNegativeSubscriptionBalances(),
    safeCount(Call, {
      status: { $in: TERMINAL_STATUSES },
      creditReservationHeld: { $gt: 0 },
      creditReservationReleasedAt: null,
    }),
    safeCount(TelecomChaosSnapshot, { snapshotType: "replay_divergence", createdAt: { $gte: since24h } }),
    safeCount(ProfitEvent, {
      eventType: { $in: ["billing_stuck_detected", "billing_drift_detected", "billing_timeline_corruption"] },
      timestamp: { $gte: since15m },
    }),
    safeCount(ProfitEvent, { eventType: "billing_recovery_attempted", timestamp: { $gte: since1m } }),
    safeCount(ProfitEvent, { eventType: "billing_recovery_attempted", timestamp: { $gte: since15m } }),
    safeCount(TelecomChaosSnapshot, { snapshotType: "orphan_active_call", createdAt: { $gte: since24h } }),
    safeCount(ProfitEvent, { eventType: "stale_webrtc_session", timestamp: { $gte: since24h } }),
    safeCount(ProfitEvent, { eventType: "economic_lock_starvation", timestamp: { $gte: since24h } }),
    safeCount(TelecomChaosSnapshot, { snapshotType: "split_brain_detected", createdAt: { $gte: since24h } }),
    safeCount(TelecomChaosSnapshot, { snapshotType: "duplicate_interval_detected", createdAt: { $gte: since24h } }),
  ]);

  const ringTail = perfQuick.ringTail || [];
  const lastRing = ringTail[ringTail.length - 1] || {};

  return {
    success: true,
    capturedAt: new Date().toISOString(),
    deploymentMode: getDeploymentMode(),
    liveEconomics: {
      activeCalls,
      callsBillingNow: billingNow,
      projectedOutstandingIntervalExposure: projectedExposure,
      reservedCreditsTotal: reservedTotal,
      intervalChargesPerMinute: intervalCharges1m,
      duplicatePreventionCount1m: dupPrevention1m,
      insufficientCreditRejectsPerMinute: null,
      insufficientCreditRejectsNote:
        "Requires CALL_AUDIT_FAILED_ATTEMPTS=true for persisted rejected outbound attempts, or future dedicated counter.",
    },
    ledgerHealth: {
      recentBillingFailures15m: billingFailures15m,
      duplicateIdempotencyCollisions1m: dupPrevention1m,
      recentJournalDivergences24h: replayDiv24h,
      negativeBalanceUsers: negSubs ?? negUsers,
      unreleasedReservationsOnTerminalCalls: unreleasedTerminal,
      replayMismatches24h: replayDiv24h,
      duplicateIntervalDetections24h: dupInterval24h,
      splitBrainDetections24h: splitBrain24h,
    },
    recoveryHealth: {
      recoveryRunsPerMinute: recoveryRuns1m,
      billingRecoveryAttemptsLast15m: recoveryAttempts15m,
      staleCallsRepaired24h: staleRepairs24h,
      stuckSessionsFound24h: stuckSessions24h,
      lockStarvationCount24h: lockStarvation24h,
    },
    pressureHealth: {
      telecomPressureLevel: pressure.pressureLevel ?? null,
      telecomPressureScore: pressure.pressureScore ?? null,
      websocketEmitRateProxy: lastRing.transitionThroughput60s ?? latestPerf?.transitionThroughput60s ?? null,
      webhookBurstRateProxy: lastRing.webhookThroughput60s ?? latestPerf?.webhookThroughput60s ?? null,
      webhookBurstTopKeys: burst.topKeys?.slice(0, 8) ?? [],
      redisPingMs: latestPerf?.redisPingMs ?? pressure.hints?.redisPingMs ?? null,
      mongoPingMs: latestPerf?.mongoPingMs ?? pressure.hints?.mongoPingMs ?? null,
      webhookLatency1h: webhookAgg,
    },
    readinessHint: {
      redisConfigured: Boolean(String(process.env.REDIS_URL || "").trim()),
      stripeSecretConfigured: Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim()),
    },
  };
}
