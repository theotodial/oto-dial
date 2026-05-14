import mongoose from "mongoose";
import CreditLedger from "../models/CreditLedger.js";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";
import StripeInvoice from "../models/StripeInvoice.js";
import ProfitEvent from "../models/ProfitEvent.js";

const CACHE_TTL_MS = Number(process.env.PROFITABILITY_CACHE_TTL_MS || 10 * 60 * 1000);
const DEFAULT_WINDOW_MS = Number(process.env.PROFITABILITY_DEFAULT_WINDOW_MS || 30 * 24 * 60 * 60 * 1000);
const DEFAULT_SHORT_CALL_SECONDS = Number(process.env.PROFITABILITY_SHORT_CALL_SECONDS || 10);

const profitabilityCache = {
  allUsers: { value: null, expiresAt: 0, key: null },
  users: new Map(),
};

function normalizeDateRange({ startDate = null, endDate = null } = {}) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : new Date(end.getTime() - DEFAULT_WINDOW_MS);
  const safeStart = Number.isNaN(start.getTime()) ? new Date(end.getTime() - DEFAULT_WINDOW_MS) : start;
  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  return { startDate: safeStart, endDate: safeEnd };
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

function round(value, digits = 4) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(digits));
}

function buildWindowCacheKey({ startDate, endDate }) {
  return `${new Date(startDate).toISOString()}::${new Date(endDate).toISOString()}`;
}

function isCacheFresh(entry) {
  return Boolean(entry && entry.expiresAt > Date.now() && entry.value);
}

function buildTelemetryPayload(userId, metrics, window, extras = {}) {
  return {
    userId: userId ? String(userId) : null,
    window,
    total_telnyx_cost_estimate: metrics.total_telnyx_cost_estimate,
    total_credits_consumed: metrics.total_credits_consumed,
    total_subscription_revenue: metrics.total_subscription_revenue,
    gross_margin: metrics.gross_margin,
    margin_ratio: metrics.margin_ratio,
    reject_ratio: metrics.reject_ratio,
    avg_call_duration: metrics.avg_call_duration,
    cost_per_answered_call: metrics.cost_per_answered_call,
    cost_per_rejected_call: metrics.cost_per_rejected_call,
    ...extras,
  };
}

function mapUserMetrics(userId, row) {
  const outboundAttempts = Number(row.outboundAttempts || 0);
  const answeredCalls = Number(row.answeredCalls || 0);
  const rejectedCalls = Number(row.rejectedCalls || 0);
  const totalAnsweredSeconds = Number(row.totalAnsweredSeconds || 0);

  const callCost = Number(row.callCost || 0);
  const smsCost = Number(row.smsCost || 0) + Number(row.smsCarrierFees || 0);
  const totalTelnyxCost = callCost + smsCost;
  const creditsConsumed = Math.max(0, Number(row.totalCreditsConsumed || 0));
  const revenue = Math.max(0, Number(row.totalSubscriptionRevenue || 0));
  const grossMargin = revenue - totalTelnyxCost;
  const marginRatio = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
  const rejectRatio = outboundAttempts > 0 ? (rejectedCalls / outboundAttempts) * 100 : 0;
  const avgCallDuration = answeredCalls > 0 ? totalAnsweredSeconds / answeredCalls : 0;
  const costPerAnsweredCall = answeredCalls > 0 ? totalTelnyxCost / answeredCalls : 0;
  const costPerRejectedCall = rejectedCalls > 0 ? totalTelnyxCost / rejectedCalls : 0;
  const shortAnsweredCalls = Number(row.shortAnsweredCalls || 0);
  const shortCallRatio = answeredCalls > 0 ? (shortAnsweredCalls / answeredCalls) * 100 : 0;

  return {
    userId: String(userId),
    total_telnyx_cost_estimate: round(totalTelnyxCost, 4),
    total_credits_consumed: round(creditsConsumed, 2),
    total_subscription_revenue: round(revenue, 2),
    gross_margin: round(grossMargin, 2),
    margin_ratio: round(marginRatio, 2),
    reject_ratio: round(rejectRatio, 2),
    avg_call_duration: round(avgCallDuration, 2),
    cost_per_answered_call: round(costPerAnsweredCall, 4),
    cost_per_rejected_call: round(costPerRejectedCall, 4),
    outbound_attempts: outboundAttempts,
    answered_calls: answeredCalls,
    rejected_calls: rejectedCalls,
    short_answered_calls: shortAnsweredCalls,
    short_call_ratio: round(shortCallRatio, 2),
  };
}

async function aggregateUserRows({ startDate, endDate, userIds = [] }) {
  const callMatch = { createdAt: { $gte: startDate, $lte: endDate } };
  const smsMatch = { createdAt: { $gte: startDate, $lte: endDate } };
  const ledgerMatch = {
    createdAt: { $gte: startDate, $lte: endDate },
    type: { $in: ["outbound_attempt_charge", "connected_duration_charge", "sms_charge"] },
  };
  const invoiceMatch = {
    createdAt: { $gte: startDate, $lte: endDate },
    status: "paid",
  };

  if (Array.isArray(userIds) && userIds.length > 0) {
    callMatch.user = { $in: userIds };
    smsMatch.user = { $in: userIds };
    ledgerMatch.user = { $in: userIds };
    invoiceMatch.userId = { $in: userIds };
  }

  const [callsByUser, smsByUser, creditsByUser, revenueByUser] = await Promise.all([
    Call.aggregate([
      { $match: callMatch },
      {
        $group: {
          _id: "$user",
          callCost: { $sum: { $ifNull: ["$cost", 0] } },
          outboundAttempts: {
            $sum: {
              $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0],
            },
          },
          answeredCalls: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$direction", "outbound"] },
                    {
                      $in: [
                        "$status",
                        ["answered", "in-progress", "completed"],
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          rejectedCalls: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$direction", "outbound"] },
                    {
                      $in: [
                        "$status",
                        ["rejected", "busy", "no-answer", "failed", "canceled"],
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalAnsweredSeconds: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$direction", "outbound"] },
                    {
                      $in: [
                        "$status",
                        ["answered", "in-progress", "completed"],
                      ],
                    },
                  ],
                },
                { $ifNull: ["$billedSeconds", { $ifNull: ["$durationSeconds", 0] }] },
                0,
              ],
            },
          },
          shortAnsweredCalls: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$direction", "outbound"] },
                    {
                      $in: [
                        "$status",
                        ["answered", "in-progress", "completed"],
                      ],
                    },
                    {
                      $lte: [
                        { $ifNull: ["$billedSeconds", { $ifNull: ["$durationSeconds", 0] }] },
                        DEFAULT_SHORT_CALL_SECONDS,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    SMS.aggregate([
      { $match: smsMatch },
      {
        $group: {
          _id: "$user",
          smsCost: { $sum: { $ifNull: ["$cost", 0] } },
          smsCarrierFees: { $sum: { $ifNull: ["$carrierFees", 0] } },
        },
      },
    ]),
    CreditLedger.aggregate([
      { $match: ledgerMatch },
      {
        $group: {
          _id: "$user",
          totalCreditsConsumed: { $sum: { $abs: "$amount" } },
        },
      },
    ]),
    StripeInvoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: "$userId",
          totalSubscriptionRevenue: { $sum: { $ifNull: ["$amountPaid", 0] } },
        },
      },
    ]),
  ]);

  const rowsByUser = new Map();
  const upsertRow = (uid, patch) => {
    const key = uid ? String(uid) : null;
    if (!key) return;
    const existing = rowsByUser.get(key) || {};
    rowsByUser.set(key, { ...existing, ...patch });
  };

  for (const row of callsByUser) {
    upsertRow(row._id, {
      callCost: Number(row.callCost || 0),
      outboundAttempts: Number(row.outboundAttempts || 0),
      answeredCalls: Number(row.answeredCalls || 0),
      rejectedCalls: Number(row.rejectedCalls || 0),
      totalAnsweredSeconds: Number(row.totalAnsweredSeconds || 0),
      shortAnsweredCalls: Number(row.shortAnsweredCalls || 0),
    });
  }
  for (const row of smsByUser) {
    upsertRow(row._id, {
      smsCost: Number(row.smsCost || 0),
      smsCarrierFees: Number(row.smsCarrierFees || 0),
    });
  }
  for (const row of creditsByUser) {
    upsertRow(row._id, {
      totalCreditsConsumed: Number(row.totalCreditsConsumed || 0),
    });
  }
  for (const row of revenueByUser) {
    upsertRow(row._id, {
      totalSubscriptionRevenue: Number(row.totalSubscriptionRevenue || 0),
    });
  }

  return rowsByUser;
}

export async function calculateUserProfitability({
  userId,
  startDate = null,
  endDate = null,
  forceRefresh = false,
  emitEvent = false,
} = {}) {
  const uid = toObjectId(userId);
  if (!uid) throw new Error("invalid_user_id");
  const window = normalizeDateRange({ startDate, endDate });
  const cacheKey = `${String(uid)}::${buildWindowCacheKey(window)}`;

  if (!forceRefresh) {
    const cached = profitabilityCache.users.get(cacheKey);
    if (isCacheFresh(cached)) return cached.value;
  }

  const rowsByUser = await aggregateUserRows({
    ...window,
    userIds: [uid],
  });
  const row = rowsByUser.get(String(uid)) || {};
  const metrics = mapUserMetrics(uid, row);

  if (emitEvent) {
    await ProfitEvent.create({
      userId: uid,
      eventType: "profitability_user_calculated",
      severity: "info",
      payload: buildTelemetryPayload(uid, metrics, window),
      timestamp: new Date(),
    }).catch(() => {});
  }

  const payload = {
    ...metrics,
    window: {
      startDate: window.startDate.toISOString(),
      endDate: window.endDate.toISOString(),
    },
  };
  profitabilityCache.users.set(cacheKey, {
    value: payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return payload;
}

export async function calculateAllUsersProfitability({
  startDate = null,
  endDate = null,
  forceRefresh = false,
} = {}) {
  const window = normalizeDateRange({ startDate, endDate });
  const windowKey = buildWindowCacheKey(window);
  if (!forceRefresh) {
    const cached = profitabilityCache.allUsers;
    if (isCacheFresh(cached) && cached.key === windowKey) {
      return cached.value;
    }
  }

  const rowsByUser = await aggregateUserRows(window);
  const all = Array.from(rowsByUser.entries()).map(([uid, row]) => mapUserMetrics(uid, row));
  all.sort((a, b) => b.total_telnyx_cost_estimate - a.total_telnyx_cost_estimate);

  const out = {
    window: {
      startDate: window.startDate.toISOString(),
      endDate: window.endDate.toISOString(),
    },
    users: all,
    generatedAt: new Date().toISOString(),
  };

  profitabilityCache.allUsers = {
    value: out,
    key: windowKey,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return out;
}

export function clearProfitabilityCache() {
  profitabilityCache.allUsers = { value: null, expiresAt: 0, key: null };
  profitabilityCache.users.clear();
}

export function getProfitabilityCacheMeta() {
  return {
    ttlMs: CACHE_TTL_MS,
    allUsersCached: Boolean(profitabilityCache.allUsers?.value),
    allUsersExpiresAt: profitabilityCache.allUsers?.expiresAt || 0,
    perUserEntries: profitabilityCache.users.size,
  };
}

export async function emitProfitabilityCostSpikeEvent({ userId, metrics, window, threshold = 2 }) {
  if (!metrics) return;
  const spike = Number(metrics.cost_per_answered_call || 0);
  if (!Number.isFinite(spike) || spike <= threshold) return;
  await ProfitEvent.create({
    userId: toObjectId(userId) || null,
    eventType: "cost_spike_detected",
    severity: "warning",
    payload: buildTelemetryPayload(userId, metrics, window, { threshold }),
    timestamp: new Date(),
  }).catch(() => {});
}
