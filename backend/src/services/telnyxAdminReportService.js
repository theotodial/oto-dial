import Call from "../models/Call.js";
import SMS from "../models/SMS.js";
import PhoneNumber from "../models/PhoneNumber.js";
import TelnyxCost from "../models/TelnyxCost.js";
import {
  ACTIVE_PHONE_NUMBER_QUERY,
  getTelnyxNumberMonthlyUsd,
} from "./telnyxBillingReportService.js";
import getTelnyxClient from "./telnyxService.js";
import {
  getCallTelnyxCost,
  getSmsTelnyxCost,
} from "./telnyxWebhookCostAggregationService.js";
import { buildTelnyxActivityReport } from "./telnyxLiveActivityService.js";
import {
  buildTelnyxBalanceDepositHistory,
  buildTelnyxUpcomingCosts,
} from "./telnyxBalanceHistoryService.js";

const DETAIL_LIMIT = 500;
const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;
const CHARGES_CHUNK_DAYS = 31;

function roundUsd(value) {
  return parseFloat(Number(value || 0).toFixed(4));
}

function parseMoney(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDayKey(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function chunkDays(startDate, endDate, maxDays = CHARGES_CHUNK_DAYS) {
  const chunks = [];
  let cursor = new Date(startDate);
  const end = new Date(endDate);

  while (cursor < end) {
    const chunkEnd = new Date(Math.min(end.getTime(), addDays(cursor, maxDays).getTime()));
    chunks.push({ start: new Date(cursor), end: chunkEnd });
    cursor = new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000);
  }

  return chunks.length > 0 ? chunks : [{ start: startDate, end: endDate }];
}

function resolveNumberMonthlyUsd(number) {
  const stored = Number(number?.monthlyCost);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return getTelnyxNumberMonthlyUsd();
}

async function fetchTelnyxNumberChargesBreakdown(start, end) {
  const telnyx = getTelnyxClient();
  if (!telnyx) return { available: false, error: "Telnyx API key not configured" };

  const chunks = chunkDays(start, end);
  let periodTotal = 0;
  let mrcTotal = 0;
  let otcTotal = 0;
  let numberCount = 0;
  const byNumber = new Map();
  let chunksFetched = 0;

  for (const chunk of chunks) {
    const startDate = formatDayKey(chunk.start);
    const endDate = formatDayKey(addDays(chunk.end, 1));
    if (!startDate || !endDate) continue;

    try {
      const response = await telnyx.chargesBreakdown.retrieve({
        start_date: startDate,
        end_date: endDate,
      });
      chunksFetched += 1;
      const results = Array.isArray(response?.results)
        ? response.results
        : Array.isArray(response?.data?.results)
          ? response.data.results
          : [];
      for (const row of results) {
        numberCount += 1;
        let rowTotal = 0;
        for (const service of row?.services || []) {
          const cost = parseMoney(service?.cost);
          rowTotal += Math.abs(cost);
          const costType = String(service?.cost_type || "").toUpperCase();
          if (costType === "MRC") mrcTotal += Math.abs(cost);
          else if (costType === "OTC") otcTotal += Math.abs(cost);
        }
        periodTotal += rowTotal;
        const tn = row?.tn || `row-${byNumber.size}`;
        byNumber.set(tn, roundUsd((byNumber.get(tn) || 0) + rowTotal));
      }
    } catch (err) {
      return {
        available: chunksFetched > 0,
        periodTotal: roundUsd(periodTotal),
        mrcTotal: roundUsd(mrcTotal),
        otcTotal: roundUsd(otcTotal),
        numberCount,
        error: err?.message || "Failed to fetch charges breakdown",
      };
    }
  }

  return {
    available: chunksFetched > 0,
    periodTotal: roundUsd(periodTotal),
    mrcTotal: roundUsd(mrcTotal),
    otcTotal: roundUsd(otcTotal),
    numberCount,
    chunksFetched,
    chunksTotal: chunks.length,
    error: null,
  };
}

function buildInventoryNumberCosts(numbers, start, end) {
  let monthlyTotal = 0;
  let periodTotal = 0;
  let oneTimeTotal = 0;
  let syncedCount = 0;

  for (const number of numbers) {
    const monthlyCost = resolveNumberMonthlyUsd(number);
    monthlyTotal += monthlyCost;
    if (Number(number?.monthlyCost) > 0 && number?.costSyncedAt) syncedCount += 1;

    const createdAt = number.createdAt ? new Date(number.createdAt) : new Date(0);
    const activeStart = createdAt > start ? createdAt : start;
    const activeMs = Math.max(0, end.getTime() - activeStart.getTime());
    periodTotal += (monthlyCost / MS_PER_MONTH) * activeMs;

    if (createdAt >= start && createdAt <= end) {
      oneTimeTotal += Number(number.oneTimeFees || 0) + Number(number.extraFees || 0);
    }
  }

  return {
    monthlyTotal: roundUsd(monthlyTotal),
    periodTotal: roundUsd(periodTotal + oneTimeTotal),
    oneTimeTotal: roundUsd(oneTimeTotal),
    syncedCount,
    unsyncedCount: Math.max(0, numbers.length - syncedCount),
  };
}

function prorateNumberCost(number, start, end) {
  const monthlyCost = resolveNumberMonthlyUsd(number);
  const createdAt = number.createdAt ? new Date(number.createdAt) : new Date(0);
  const activeStart = createdAt > start ? createdAt : start;
  const activeMs = Math.max(0, end.getTime() - activeStart.getTime());
  const periodCost = (monthlyCost / MS_PER_MONTH) * activeMs;
  let oneTime = 0;
  if (createdAt >= start && createdAt <= end) {
    oneTime = Number(number.oneTimeFees || 0) + Number(number.extraFees || 0);
  }
  return roundUsd(periodCost + oneTime);
}

function mapCallDetail(call) {
  const cost = getCallTelnyxCost(call);
  return {
    id: String(call._id),
    userId: call.user?._id ? String(call.user._id) : String(call.user || ""),
    userEmail: call.user?.email || null,
    userName: call.user?.name || null,
    from: call.fromNumber || null,
    to: call.toNumber || null,
    direction: call.direction || null,
    status: call.status || null,
    durationSeconds: Number(call.durationSeconds || 0),
    billedSeconds: Number(call.billedSeconds || 0),
    cost,
    carrierFee: Number(call.carrierFee || 0),
    costSyncedAt: call.costSyncedAt || null,
    telnyxCallId: call.telnyxCallId || call.telnyxCallControlId || null,
    at: call.createdAt,
  };
}

function mapSmsDetail(sms) {
  const cost = getSmsTelnyxCost(sms);
  const body = sms.body || sms.text || "";
  return {
    id: String(sms._id),
    userId: sms.user?._id ? String(sms.user._id) : String(sms.user || ""),
    userEmail: sms.user?.email || null,
    userName: sms.user?.name || null,
    from: sms.from || null,
    to: sms.to || null,
    direction: sms.direction || null,
    status: sms.status || null,
    cost,
    carrierFees: Number(sms.carrierFees || 0),
    costSyncedAt: sms.costSyncedAt || null,
    messageId: sms.telnyxMessageId || null,
    bodyPreview: String(body).slice(0, 120),
    at: sms.createdAt,
  };
}

function buildUserSpendRows({ calls, sms, numbers, ledgerRows, start, end }) {
  const rows = new Map();

  const ensure = (userId, email, name) => {
    const key = String(userId || "");
    if (!key) return null;
    if (!rows.has(key)) {
      rows.set(key, {
        userId: key,
        email: email || "Unknown",
        name: name || email || "Unknown",
        callCost: 0,
        smsCost: 0,
        numberCost: 0,
        ledgerCost: 0,
        totalCost: 0,
        callCount: 0,
        smsCount: 0,
        numberCount: 0,
      });
    }
    return rows.get(key);
  };

  for (const call of calls) {
    const row = ensure(call.user?._id || call.user, call.user?.email, call.user?.name);
    if (!row) continue;
    const cost = getCallTelnyxCost(call);
    row.callCost += cost;
    row.callCount += 1;
  }

  for (const item of sms) {
    const row = ensure(item.user?._id || item.user, item.user?.email, item.user?.name);
    if (!row) continue;
    const cost = getSmsTelnyxCost(item);
    row.smsCost += cost;
    row.smsCount += 1;
  }

  for (const number of numbers) {
    const user = number.userId;
    const row = ensure(user?._id || user, user?.email, user?.name);
    if (!row) continue;
    const cost = prorateNumberCost(number, start, end);
    row.numberCost += cost;
    row.numberCount += 1;
  }

  for (const entry of ledgerRows) {
    const userId = entry._id;
    const row = ensure(userId);
    if (!row) continue;
    row.ledgerCost += Number(entry.total || 0);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      callCost: roundUsd(row.callCost),
      smsCost: roundUsd(row.smsCost),
      numberCost: roundUsd(row.numberCost),
      ledgerCost: roundUsd(row.ledgerCost),
      totalCost: roundUsd(row.callCost + row.smsCost + row.numberCost),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

export async function buildTelnyxAdminReport({ start, end, syncPending = false } = {}) {
  const summary = await buildTelnyxActivityReport({ start, end, syncPending });
  const [balanceHistory, upcomingCosts] = await Promise.all([
    buildTelnyxBalanceDepositHistory(),
    buildTelnyxUpcomingCosts({ balance: summary.balance }),
  ]);
  const dateFilter = { createdAt: { $gte: start, $lte: end } };
  const ledgerDateFilter = { eventTimestamp: { $gte: start, $lte: end } };

  const [calls, sms, numbers, ledgerRows, ledgerByType, chargesBreakdown] = await Promise.all([
    Call.find(dateFilter)
      .populate("user", "email name")
      .sort({ createdAt: -1 })
      .limit(DETAIL_LIMIT)
      .lean(),
    SMS.find(dateFilter)
      .populate("user", "email name")
      .sort({ createdAt: -1 })
      .limit(DETAIL_LIMIT)
      .lean(),
    PhoneNumber.find(ACTIVE_PHONE_NUMBER_QUERY)
      .populate("userId", "email name")
      .sort({ phoneNumber: 1 })
      .lean(),
    TelnyxCost.aggregate([
      { $match: ledgerDateFilter },
      {
        $group: {
          _id: "$userId",
          total: { $sum: "$totalCostUsd" },
          count: { $sum: 1 },
        },
      },
    ]),
    TelnyxCost.aggregate([
      { $match: ledgerDateFilter },
      {
        $group: {
          _id: "$resourceType",
          total: { $sum: "$totalCostUsd" },
          count: { $sum: 1 },
        },
      },
    ]),
    fetchTelnyxNumberChargesBreakdown(start, end),
  ]);

  const inventoryNumberCosts = buildInventoryNumberCosts(numbers, start, end);
  const apiWindowNumberCost = parseMoney(summary?.window?.api?.numbers?.totalCost);
  const numberCosts = {
    source:
      chargesBreakdown.available && chargesBreakdown.periodTotal > 0
        ? "telnyx_charges_breakdown"
        : apiWindowNumberCost > 0
          ? "telnyx_api_billing"
          : "inventory",
    monthlyTotal: inventoryNumberCosts.monthlyTotal,
    periodTotal:
      chargesBreakdown.available && chargesBreakdown.periodTotal > 0
        ? chargesBreakdown.periodTotal
        : apiWindowNumberCost > 0
          ? roundUsd(apiWindowNumberCost)
          : inventoryNumberCosts.periodTotal,
    mrcTotal: chargesBreakdown.mrcTotal || inventoryNumberCosts.monthlyTotal,
    otcTotal: chargesBreakdown.otcTotal || inventoryNumberCosts.oneTimeTotal,
    syncedCount: inventoryNumberCosts.syncedCount,
    unsyncedCount: inventoryNumberCosts.unsyncedCount,
    chargesBreakdown,
  };

  const callDetails = calls.map(mapCallDetail);
  const smsDetails = sms.map(mapSmsDetail);
  const numberInventory = numbers.map((number) => {
    const user = number.userId;
    const periodCost = prorateNumberCost(number, start, end);
    return {
      id: String(number._id),
      phoneNumber: number.phoneNumber,
      userId: user?._id ? String(user._id) : String(user || ""),
      userEmail: user?.email || null,
      userName: user?.name || null,
      countryCode: number.countryCode || number.iso2 || null,
      status: number.status || null,
      monthlyCost: roundUsd(resolveNumberMonthlyUsd(number)),
      monthlyCostSynced: Boolean(number.costSyncedAt && Number(number.monthlyCost) > 0),
      periodCost,
      oneTimeFees: roundUsd(number.oneTimeFees || 0),
      costSyncedAt: number.costSyncedAt || null,
      telnyxPhoneNumberId: number.telnyxPhoneNumberId || null,
      createdAt: number.createdAt,
    };
  });

  const userSpend = buildUserSpendRows({
    calls,
    sms,
    numbers,
    ledgerRows,
    start,
    end,
  });

  const ledgerSummary = {
    totalCost: roundUsd(ledgerByType.reduce((sum, row) => sum + Number(row.total || 0), 0)),
    byType: ledgerByType.map((row) => ({
      resourceType: row._id,
      totalCost: roundUsd(row.total),
      count: Number(row.count || 0),
    })),
  };

  return {
    ...summary,
    balanceHistory,
    upcomingCosts,
    userSpend,
    callDetails,
    smsDetails,
    numberInventory,
    numberCosts,
    ledgerSummary,
    totals: {
      callRecords: callDetails.length,
      smsRecords: smsDetails.length,
      activeNumbers: numberInventory.length,
      usersWithSpend: userSpend.length,
      callCostTotal: roundUsd(callDetails.reduce((s, r) => s + r.cost, 0)),
      smsCostTotal: roundUsd(smsDetails.reduce((s, r) => s + r.cost, 0)),
      numberCostTotal: numberCosts.monthlyTotal,
      numberCostPeriodTotal: numberCosts.periodTotal,
      numberCostMrcTotal: numberCosts.mrcTotal,
      numberCostSource: numberCosts.source,
    },
  };
}

export default {
  buildTelnyxAdminReport,
};
