import getTelnyxClient from "./telnyxService.js";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";
import PhoneNumber from "../models/PhoneNumber.js";
import {
  getTelnyxBillingSummary,
  ACTIVE_PHONE_NUMBER_QUERY,
} from "./telnyxBillingReportService.js";
import {
  aggregateCallCosts,
  aggregateSmsCosts,
  aggregateNumberCosts,
} from "./telnyxWebhookCostAggregationService.js";
import { syncPendingTelnyxCostsInRange } from "./telnyxCostService.js";

function parseMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundUsd(value) {
  return parseFloat(Number(value || 0).toFixed(4));
}

export async function fetchTelnyxAccountBalance() {
  const telnyx = getTelnyxClient();
  if (!telnyx) {
    return { available: false, error: "Telnyx API key not configured" };
  }

  try {
    const resp = await telnyx.balance.retrieve();
    const data = resp?.data || {};
    return {
      available: true,
      balance: parseMoney(data.balance),
      availableCredit: parseMoney(data.available_credit),
      creditLimit: parseMoney(data.credit_limit),
      pending: parseMoney(data.pending),
      currency: data.currency || "USD",
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { available: false, error: err?.message || "Failed to fetch Telnyx balance" };
  }
}

export async function buildTelnyxActivityReport({ start, end, syncPending = false } = {}) {
  let syncResult = null;
  if (syncPending) {
    syncResult = await syncPendingTelnyxCostsInRange({
      startDate: start,
      endDate: end,
      limit: 50,
    });
  }

  const dateFilter = { createdAt: { $gte: start, $lte: end } };

  const [calls, sms, numbers, balance] = await Promise.all([
    Call.find(dateFilter).lean(),
    SMS.find(dateFilter).lean(),
    PhoneNumber.find(ACTIVE_PHONE_NUMBER_QUERY).lean(),
    fetchTelnyxAccountBalance(),
  ]);

  const apiBilling = await getTelnyxBillingSummary({
    startDate: start,
    endDate: end,
    bypassCache: syncPending,
    mongoCalls: calls,
    mongoSms: sms,
    activeNumbers: numbers,
  });

  const webhookCalls = aggregateCallCosts(calls);
  const webhookSms = aggregateSmsCosts(sms);
  const webhookNumbers = aggregateNumberCosts(numbers, start, end);
  const webhookTotal =
    webhookCalls.totalCost + webhookSms.totalCost + webhookNumbers.totalCost;

  return {
    balance,
    sync: syncResult,
    window: {
      api: {
        source: apiBilling.source || "unavailable",
        totalCost: roundUsd(apiBilling.totalTelnyxCost),
        calls: {
          totalCost: roundUsd(apiBilling.calls?.totalCost),
          count: Number(apiBilling.calls?.count || 0),
        },
        sms: {
          totalCost: roundUsd(apiBilling.sms?.totalCost),
          count: Number(apiBilling.sms?.count || 0),
        },
        numbers: {
          totalCost: roundUsd(apiBilling.numbers?.totalCost),
          activeCount: Number(apiBilling.numbers?.activeCount || 0),
        },
        fetchedAt: apiBilling.fetchedAt || null,
        lookbackCapped: Boolean(apiBilling.lookbackCapped),
        mongoSupplementUsed: Boolean(apiBilling.mongoSupplementUsed),
      },
      webhook: {
        totalCost: roundUsd(webhookTotal),
        calls: {
          totalCost: roundUsd(webhookCalls.totalCost),
          pendingCosts: webhookCalls.pendingCosts,
          apiSyncedCount: webhookCalls.apiSyncedCount,
        },
        sms: {
          totalCost: roundUsd(webhookSms.totalCost),
          pendingCosts: webhookSms.pendingCosts,
          apiSyncedCount: webhookSms.apiSyncedCount,
        },
        numbers: {
          totalCost: roundUsd(webhookNumbers.totalCost),
        },
      },
    },
  };
}
