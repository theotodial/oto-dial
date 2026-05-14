import User from "../../models/User.js";
import ProfitEvent from "../../models/ProfitEvent.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";
import {
  calculateAllUsersProfitability,
  emitProfitabilityCostSpikeEvent,
} from "../../services/userProfitabilityEngine.js";

const AGENT = "profit-protection-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_PROFIT_PROTECTION_INTERVAL_MS || 12 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_PROFIT_PROTECTION_LEASE_MS || 11 * 60 * 1000);
const OUTBOUND_MIN_THRESHOLD = Number(process.env.AGENT_PROFIT_MIN_OUTBOUND_ATTEMPTS || 20);
const LIFETIME_CALLS_THRESHOLD = Number(process.env.AGENT_PROFIT_LIFETIME_CALLS_THRESHOLD || 50);
const REJECT_HIGH_PERCENT = Number(process.env.AGENT_PROFIT_REJECT_HIGH_PERCENT || 70);
const REJECT_EXTREME_PERCENT = Number(process.env.AGENT_PROFIT_REJECT_EXTREME_PERCENT || 85);
const SHORT_CALL_SECONDS = Number(process.env.AGENT_PROFIT_SHORT_CALL_SECONDS || 10);
const SHORT_CALL_RATIO_PERCENT = Number(process.env.AGENT_PROFIT_SHORT_CALL_RATIO_PERCENT || 70);
const COST_SPIKE_THRESHOLD = Number(process.env.AGENT_PROFIT_COST_SPIKE_THRESHOLD || 2.0);

function computeDegradation(metrics) {
  const outboundAttempts = Number(metrics.outbound_attempts || 0);
  const rejectRatio = Number(metrics.reject_ratio || 0);
  const margin = Number(metrics.gross_margin || 0);
  const lifetimeCalls = outboundAttempts;

  const throttleDelayMs =
    rejectRatio > 80 && outboundAttempts >= OUTBOUND_MIN_THRESHOLD
      ? 1000 + Math.min(2000, Math.round((rejectRatio - 80) * 40))
      : 0;

  const reservationMultiplier =
    margin < 0 && rejectRatio > REJECT_EXTREME_PERCENT
      ? 2
      : margin < 0 && lifetimeCalls >= LIFETIME_CALLS_THRESHOLD
      ? 1.2
      : 1;

  const maxConcurrentCalls =
    margin < 0 && lifetimeCalls >= LIFETIME_CALLS_THRESHOLD
      ? 2
      : null;

  return { throttleDelayMs, reservationMultiplier, maxConcurrentCalls };
}

function buildRiskFlags(metrics) {
  const negativeMargin = Number(metrics.gross_margin || 0) < 0;
  const highReject = Number(metrics.reject_ratio || 0) > REJECT_HIGH_PERCENT;
  const coldCallPattern =
    Number(metrics.avg_call_duration || 0) < SHORT_CALL_SECONDS &&
    Number(metrics.outbound_attempts || 0) >= OUTBOUND_MIN_THRESHOLD &&
    Number(metrics.short_call_ratio || 0) >= SHORT_CALL_RATIO_PERCENT;

  return {
    negativeMargin,
    abuseRisk: highReject || coldCallPattern,
    coldCallPattern,
  };
}

async function persistRiskState(userId, metrics) {
  const riskFlags = buildRiskFlags(metrics);
  const degrade = computeDegradation(metrics);
  const burningCreditsFasterThanRevenue =
    Number(metrics.total_credits_consumed || 0) > Number(metrics.total_subscription_revenue || 0);

  const patch = {
    "riskFlags.negativeMargin": Boolean(riskFlags.negativeMargin),
    "riskFlags.abuseRisk": Boolean(riskFlags.abuseRisk),
    "riskFlags.coldCallPattern": Boolean(riskFlags.coldCallPattern),
    "riskFlags.lastRiskEvaluatedAt": new Date(),
    "riskFlags.lastRejectRatio": Number(metrics.reject_ratio || 0),
    "riskFlags.lastGrossMargin": Number(metrics.gross_margin || 0),
    "riskFlags.lastAvgCallDuration": Number(metrics.avg_call_duration || 0),
    "riskFlags.outboundAttemptVolume": Number(metrics.outbound_attempts || 0),
    "riskFlags.burningCreditsFasterThanRevenue": Boolean(burningCreditsFasterThanRevenue),
    "riskFlags.throttleDelayMs": Number(degrade.throttleDelayMs || 0),
    "riskFlags.reservationMultiplier": Number(degrade.reservationMultiplier || 1),
    "riskFlags.maxConcurrentCalls": Number.isFinite(degrade.maxConcurrentCalls)
      ? Number(degrade.maxConcurrentCalls)
      : null,
  };

  await User.updateOne({ _id: userId }, { $set: patch }).catch(() => {});

  const shouldAlert =
    riskFlags.negativeMargin || riskFlags.abuseRisk || riskFlags.coldCallPattern;
  if (!shouldAlert) return { riskFlags, degrade, alerted: false };

  emitAgentAlert(AGENT, "warning", "telecom_risk_detected", {
    userId: String(userId),
    riskFlags,
    degrade,
    metrics: {
      gross_margin: metrics.gross_margin,
      reject_ratio: metrics.reject_ratio,
      avg_call_duration: metrics.avg_call_duration,
      outbound_attempts: metrics.outbound_attempts,
    },
  });

  if (riskFlags.negativeMargin) {
    await ProfitEvent.create({
      userId,
      eventType: "profit_negative_detected",
      severity: "warning",
      payload: {
        gross_margin: metrics.gross_margin,
        margin_ratio: metrics.margin_ratio,
        total_subscription_revenue: metrics.total_subscription_revenue,
        total_telnyx_cost_estimate: metrics.total_telnyx_cost_estimate,
      },
      timestamp: new Date(),
    }).catch(() => {});
  }

  if (riskFlags.abuseRisk || riskFlags.coldCallPattern) {
    await ProfitEvent.create({
      userId,
      eventType: "abuse_pattern_detected",
      severity: "warning",
      payload: {
        reject_ratio: metrics.reject_ratio,
        avg_call_duration: metrics.avg_call_duration,
        outbound_attempts: metrics.outbound_attempts,
        short_call_ratio: metrics.short_call_ratio,
      },
      timestamp: new Date(),
    }).catch(() => {});
  }

  return { riskFlags, degrade, alerted: true };
}

export const profitProtectionAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,
  async run({ log }) {
    const payload = await calculateAllUsersProfitability({ forceRefresh: true });
    const users = Array.isArray(payload?.users) ? payload.users : [];

    let negativeMarginUsers = 0;
    let abuseRiskUsers = 0;
    let coldCallUsers = 0;
    let updatedUsers = 0;

    for (const metrics of users) {
      const userId = metrics?.userId;
      if (!userId) continue;
      const result = await persistRiskState(userId, metrics);
      updatedUsers += 1;
      if (result?.riskFlags?.negativeMargin) negativeMarginUsers += 1;
      if (result?.riskFlags?.abuseRisk) abuseRiskUsers += 1;
      if (result?.riskFlags?.coldCallPattern) coldCallUsers += 1;
      await emitProfitabilityCostSpikeEvent({
        userId,
        metrics,
        window: payload.window,
        threshold: COST_SPIKE_THRESHOLD,
      });
    }

    log("info", "profit_protection_cycle_completed", {
      scannedUsers: users.length,
      updatedUsers,
      negativeMarginUsers,
      abuseRiskUsers,
      coldCallUsers,
    });

    return {
      scannedUsers: users.length,
      updatedUsers,
      negativeMarginUsers,
      abuseRiskUsers,
      coldCallUsers,
    };
  },
};
