import getTelnyxClient from "./telnyxService.js";
import PhoneNumber from "../models/PhoneNumber.js";
import {
  getCallTelnyxCost,
  getSmsTelnyxCost,
} from "./telnyxWebhookCostAggregationService.js";

const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_TELNYX_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const DEFAULT_NUMBER_MONTHLY_USD = 2.0;

/** Mongo filter for billable inventory numbers */
export const ACTIVE_PHONE_NUMBER_QUERY = {
  $or: [{ status: "active" }, { isActive: true }],
};

export function getTelnyxNumberMonthlyUsd() {
  const env = Number(process.env.TELNYX_NUMBER_MONTHLY_USD);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_NUMBER_MONTHLY_USD;
}

function prorateMonthlyCost(monthlyUsd, startMs, endMs) {
  const activeMs = Math.max(0, endMs - startMs);
  const periodCost = (monthlyUsd / MS_PER_MONTH) * activeMs;
  return { activeMs, periodCost };
}

function addNumberCostToByDay(byDay, monthlyUsd, activeStart, activeEnd) {
  const ratePerMs = monthlyUsd / MS_PER_MONTH;
  const endMs = activeEnd.getTime();
  const cursor = new Date(activeStart);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= endMs) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const overlapStart = Math.max(activeStart.getTime(), dayStart.getTime());
    const overlapEnd = Math.min(endMs, dayEnd.getTime());
    if (overlapEnd > overlapStart) {
      addToDayMap(
        byDay,
        formatDayKey(cursor),
        "telnyxNumberCost",
        ratePerMs * (overlapEnd - overlapStart)
      );
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/** Detail record types that work reliably on most Telnyx accounts */
const CALL_DETAIL_TYPES = ["call-control"];
const SMS_DETAIL_TYPES = ["messaging"];

const summaryCache = new Map();

function parseMoney(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDayKey(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function addToDayMap(map, dayKey, field, amount) {
  if (!dayKey || amount <= 0) return;
  const entry = map.get(dayKey) || {
    telnyxCallCost: 0,
    telnyxSmsCost: 0,
    telnyxNumberCost: 0,
  };
  entry[field] += amount;
  map.set(dayKey, entry);
}

function emptyCallSummary() {
  return {
    totalCost: 0,
    inboundCost: 0,
    outboundCost: 0,
    carrierFees: 0,
    totalBilledSeconds: 0,
    count: 0,
    byDay: new Map(),
  };
}

function emptySmsSummary() {
  return {
    totalCost: 0,
    inboundCost: 0,
    outboundCost: 0,
    carrierFees: 0,
    count: 0,
    byDay: new Map(),
  };
}

function emptyNumberSummary() {
  return {
    totalCost: 0,
    monthlyCost: 0,
    monthlyRateUsd: getTelnyxNumberMonthlyUsd(),
    oneTimeCost: 0,
    extraFees: 0,
    activeCount: 0,
    activeMs: 0,
    periodMs: 0,
    byDay: new Map(),
  };
}

function cacheKey(startDate, endDate) {
  return `${new Date(startDate).toISOString()}|${new Date(endDate).toISOString()}`;
}

function chunkDateRange(startDate, endDate, maxDays = 31) {
  const chunks = [];
  let cursor = new Date(startDate);
  const end = new Date(endDate);

  while (cursor < end) {
    const chunkEnd = new Date(
      Math.min(end.getTime(), cursor.getTime() + maxDays * 24 * 60 * 60 * 1000)
    );
    chunks.push({ startDate: new Date(cursor), endDate: chunkEnd });
    cursor = new Date(chunkEnd.getTime() + 1);
  }

  return chunks.length > 0 ? chunks : [{ startDate, endDate }];
}

function pickDateRangeFilter(startDate, endDate) {
  const days = Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
  );
  if (days <= 1) return "today";
  if (days <= 2) return "yesterday";
  if (days <= 7) return `last_${days}_days`;
  if (days <= 30) return `last_${Math.min(days, 30)}_days`;
  if (days <= 60) return "last_month";
  return "last_month";
}

async function paginateDetailRecords(telnyx, recordType, startDate, endDate) {
  const records = [];
  const startDay = formatDayKey(startDate);
  const endExclusive = new Date(endDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const endDay = formatDayKey(endExclusive);
  const dateRange = pickDateRangeFilter(startDate, endDate);

  let page = 1;
  const pageSize = 250;
  const maxPages = 40;

  while (page <= maxPages) {
    let response;
    try {
      response = await telnyx.detailRecords.list({
        filter: {
          record_type: recordType,
          date_range: dateRange,
        },
        page: { number: page, size: pageSize },
        sort: ["-created_at"],
      });
    } catch {
      response = await telnyx.detailRecords.list({
        filter: {
          record_type: recordType,
          created_at: { gte: startDay, lt: endDay },
        },
        page: { number: page, size: pageSize },
        sort: ["-created_at"],
      });
    }

    const batch = Array.isArray(response?.data) ? response.data : [];
    records.push(...batch);

    const totalPages = Number(response?.meta?.total_pages || 0);
    if (!totalPages || page >= totalPages || batch.length === 0) break;
    page += 1;
  }

  return records.filter((record) => {
    const ts = record?.created_at || record?.completed_at || record?.sent_at;
    if (!ts) return true;
    const t = new Date(ts).getTime();
    return t >= startDate.getTime() && t <= endDate.getTime();
  });
}

function recordCostParts(record) {
  const baseCost = parseMoney(record?.cost);
  const carrierFee = parseMoney(record?.carrier_fee);
  return { total: baseCost + carrierFee, baseCost, carrierFee };
}

function aggregateCallRecords(records) {
  const summary = emptyCallSummary();

  for (const record of records) {
    const { total, carrierFee } = recordCostParts(record);
    if (total <= 0) continue;

    summary.totalCost += total;
    summary.carrierFees += carrierFee;
    summary.count += 1;

    const direction = String(record?.direction || "").toLowerCase();
    if (direction === "inbound") summary.inboundCost += total;
    else summary.outboundCost += total;

    const billedSeconds =
      Number(record?.billed_sec) ||
      Number(record?.call_sec) ||
      Number(record?.duration) ||
      0;
    if (billedSeconds > 0) summary.totalBilledSeconds += billedSeconds;

    addToDayMap(
      summary.byDay,
      formatDayKey(record?.created_at || record?.completed_at || record?.started_at),
      "telnyxCallCost",
      total
    );
  }

  return summary;
}

function aggregateSmsRecords(records) {
  const summary = emptySmsSummary();

  for (const record of records) {
    const { total, carrierFee } = recordCostParts(record);
    if (total <= 0) continue;

    summary.totalCost += total;
    summary.carrierFees += carrierFee;
    summary.count += 1;

    const direction = String(record?.direction || "").toLowerCase();
    if (direction === "inbound") summary.inboundCost += total;
    else summary.outboundCost += total;

    addToDayMap(
      summary.byDay,
      formatDayKey(record?.created_at || record?.completed_at || record?.sent_at),
      "telnyxSmsCost",
      total
    );
  }

  return summary;
}

function mergeCallSummaries(...summaries) {
  const merged = emptyCallSummary();
  for (const summary of summaries) {
    if (!summary) continue;
    merged.totalCost += summary.totalCost || 0;
    merged.inboundCost += summary.inboundCost || 0;
    merged.outboundCost += summary.outboundCost || 0;
    merged.carrierFees += summary.carrierFees || 0;
    merged.totalBilledSeconds += summary.totalBilledSeconds || 0;
    merged.count += summary.count || 0;
    for (const [day, values] of summary.byDay?.entries?.() || []) {
      addToDayMap(merged.byDay, day, "telnyxCallCost", values.telnyxCallCost || 0);
    }
  }
  return merged;
}

function mergeSmsSummaries(...summaries) {
  const merged = emptySmsSummary();
  for (const summary of summaries) {
    if (!summary) continue;
    merged.totalCost += summary.totalCost || 0;
    merged.inboundCost += summary.inboundCost || 0;
    merged.outboundCost += summary.outboundCost || 0;
    merged.carrierFees += summary.carrierFees || 0;
    merged.count += summary.count || 0;
    for (const [day, values] of summary.byDay?.entries?.() || []) {
      addToDayMap(merged.byDay, day, "telnyxSmsCost", values.telnyxSmsCost || 0);
    }
  }
  return merged;
}

function pickHigherSummary(apiSummary, altSummary) {
  if (!altSummary || altSummary.totalCost <= 0) return apiSummary;
  if (!apiSummary || apiSummary.totalCost <= 0) return altSummary;
  return apiSummary.totalCost >= altSummary.totalCost ? apiSummary : altSummary;
}

async function fetchUsageProductSummary(telnyx, product, startDate, endDate) {
  const isMessaging = product === "messaging";
  const summary = isMessaging ? emptySmsSummary() : emptyCallSummary();
  const dayField = isMessaging ? "telnyxSmsCost" : "telnyxCallCost";
  const metrics = isMessaging ? ["cost", "parts"] : ["cost", "billed_sec", "call_sec"];

  for (const chunk of chunkDateRange(startDate, endDate, 31)) {
    let page = 1;
    while (page <= 20) {
      const response = await telnyx.usageReports.list({
        product,
        dimensions: ["date", "direction"],
        metrics,
        start_date: chunk.startDate.toISOString(),
        end_date: chunk.endDate.toISOString(),
        page: { number: page, size: 250 },
      });

      const rows = Array.isArray(response?.data) ? response.data : [];
      for (const row of rows) {
        const cost = parseMoney(row.cost ?? row.total_cost ?? row.amount);
        if (cost <= 0) continue;

        summary.totalCost += cost;
        const direction = String(row.direction || "").toLowerCase();
        if (direction === "inbound") summary.inboundCost += cost;
        else summary.outboundCost += cost;

        if (!isMessaging) {
          summary.totalBilledSeconds += Number(row.billed_sec || row.call_sec || 0);
          summary.count += Number(row.completed || row.attempted || 0) || 1;
        } else {
          summary.count += Number(row.parts || 1);
        }

        addToDayMap(summary.byDay, formatDayKey(row.date || row.date_time), dayField, cost);
      }

      const totalPages = Number(response?.meta?.total_pages || 0);
      if (!totalPages || page >= totalPages || rows.length === 0) break;
      page += 1;
    }
  }

  return summary;
}

export function calculateNumberCostsForPeriod(
  numbers = [],
  startDate,
  endDate,
  { monthlyUsd = getTelnyxNumberMonthlyUsd() } = {}
) {
  const periodStart = new Date(startDate || 0);
  const periodEnd = new Date(endDate || Date.now());
  const summary = emptyNumberSummary();
  summary.activeCount = numbers.length;
  summary.monthlyRateUsd = monthlyUsd;
  summary.periodMs = Math.max(0, periodEnd.getTime() - periodStart.getTime());

  for (const number of numbers) {
    const oneTimeFees = parseMoney(number.oneTimeFees);
    const extraFees = parseMoney(number.extraFees);
    const createdAt = number.createdAt ? new Date(number.createdAt) : periodStart;
    const activeStart = createdAt > periodStart ? createdAt : periodStart;
    const activeEnd = periodEnd;
    const { activeMs, periodCost } = prorateMonthlyCost(
      monthlyUsd,
      activeStart.getTime(),
      activeEnd.getTime()
    );
    const rowCost = periodCost + oneTimeFees + extraFees;

    summary.totalCost += rowCost;
    summary.monthlyCost += monthlyUsd;
    summary.oneTimeCost += oneTimeFees;
    summary.extraFees += extraFees;
    summary.activeMs += activeMs;

    addNumberCostToByDay(summary.byDay, monthlyUsd, activeStart, activeEnd);
    if (oneTimeFees > 0 || extraFees > 0) {
      addToDayMap(
        summary.byDay,
        formatDayKey(createdAt),
        "telnyxNumberCost",
        oneTimeFees + extraFees
      );
    }
  }

  return summary;
}

export async function buildNumberCostsFromInventory(
  startDate,
  endDate,
  _telnyx = null,
  activeNumbers = null
) {
  const numbers =
    activeNumbers || (await PhoneNumber.find(ACTIVE_PHONE_NUMBER_QUERY).lean());
  return calculateNumberCostsForPeriod(numbers, startDate, endDate);
}

export function summarizeMongoTelnyxCosts(allCalls = [], allSms = [], allNumbers = [], startDate, endDate) {
  const calls = emptyCallSummary();
  const sms = emptySmsSummary();

  for (const call of allCalls) {
    const cost = getCallTelnyxCost(call);
    if (cost <= 0) continue;
    calls.totalCost += cost;
    calls.count += 1;
    if (call.direction === "inbound") calls.inboundCost += cost;
    else calls.outboundCost += cost;
    calls.totalBilledSeconds +=
      Number(call.billedSeconds) ||
      Number(call.durationSeconds) ||
      Number(call.duration) ||
      0;
    addToDayMap(calls.byDay, formatDayKey(call.createdAt), "telnyxCallCost", cost);
  }

  for (const row of allSms) {
    const cost = getSmsTelnyxCost(row);
    if (cost <= 0) continue;
    sms.totalCost += cost;
    sms.carrierFees += parseMoney(row.carrierFees);
    sms.count += 1;
    if (row.direction === "inbound") sms.inboundCost += cost;
    else sms.outboundCost += cost;
    addToDayMap(sms.byDay, formatDayKey(row.createdAt), "telnyxSmsCost", cost);
  }

  const numbers = calculateNumberCostsForPeriod(
    allNumbers,
    startDate,
    endDate
  );

  return { calls, sms, numbers };
}

export function mergeTelnyxDayMaps(...maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [day, values] of map?.entries?.() || []) {
      const entry = merged.get(day) || {
        telnyxCallCost: 0,
        telnyxSmsCost: 0,
        telnyxNumberCost: 0,
        totalTelnyxCost: 0,
      };
      entry.telnyxCallCost += values.telnyxCallCost || 0;
      entry.telnyxSmsCost += values.telnyxSmsCost || 0;
      entry.telnyxNumberCost += values.telnyxNumberCost || 0;
      entry.totalTelnyxCost =
        entry.telnyxCallCost + entry.telnyxSmsCost + entry.telnyxNumberCost;
      merged.set(day, entry);
    }
  }
  return merged;
}

/**
 * Telnyx billing: Usage Reports + Detail Records + number inventory ($2/mo default).
 */
export async function getTelnyxBillingSummary({
  startDate,
  endDate,
  bypassCache = false,
  activeNumbers = null,
  mongoCalls = null,
  mongoSms = null,
}) {
  const effectiveEnd = endDate || new Date();
  const lookbackFloor = new Date(effectiveEnd.getTime() - MAX_TELNYX_LOOKBACK_MS);
  const requestedStart = startDate || lookbackFloor;
  const effectiveStart = requestedStart < lookbackFloor ? lookbackFloor : requestedStart;
  const lookbackCapped = !startDate || requestedStart < lookbackFloor;
  const key = cacheKey(effectiveStart, effectiveEnd);

  if (!bypassCache && !mongoCalls && !mongoSms) {
    const cached = summaryCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.payload;
    }
  }

  const telnyx = getTelnyxClient();
  const recordTypeStats = {};
  const usageStats = {};

  let calls = emptyCallSummary();
  let sms = emptySmsSummary();

  if (telnyx) {
    let usageCalls = emptyCallSummary();
    let usageSms = emptySmsSummary();

    try {
      usageCalls = await fetchUsageProductSummary(
        telnyx,
        "call-control",
        effectiveStart,
        effectiveEnd
      );
      usageStats["call-control"] = usageCalls.totalCost;
    } catch (err) {
      console.warn("Telnyx usage report (call-control):", err.message);
    }

    try {
      usageSms = await fetchUsageProductSummary(
        telnyx,
        "messaging",
        effectiveStart,
        effectiveEnd
      );
      usageStats.messaging = usageSms.totalCost;
    } catch (err) {
      console.warn("Telnyx usage report (messaging):", err.message);
    }

    let detailCalls = emptyCallSummary();
    let detailSms = emptySmsSummary();

    for (const recordType of CALL_DETAIL_TYPES) {
      try {
        const records = await paginateDetailRecords(
          telnyx,
          recordType,
          effectiveStart,
          effectiveEnd
        );
        recordTypeStats[recordType] = records.length;
        if (records.length > 0) {
          detailCalls = mergeCallSummaries(detailCalls, aggregateCallRecords(records));
        }
      } catch (err) {
        console.warn(`Telnyx detail records (${recordType}):`, err.message);
        recordTypeStats[recordType] = 0;
      }
    }

    for (const recordType of SMS_DETAIL_TYPES) {
      try {
        const records = await paginateDetailRecords(
          telnyx,
          recordType,
          effectiveStart,
          effectiveEnd
        );
        recordTypeStats[recordType] = records.length;
        if (records.length > 0) {
          detailSms = mergeSmsSummaries(detailSms, aggregateSmsRecords(records));
        }
      } catch (err) {
        console.warn(`Telnyx detail records (${recordType}):`, err.message);
        recordTypeStats[recordType] = 0;
      }
    }

    calls = pickHigherSummary(usageCalls, detailCalls);
    sms = pickHigherSummary(usageSms, detailSms);
  }

  const numbers = await buildNumberCostsFromInventory(
    effectiveStart,
    effectiveEnd,
    telnyx,
    activeNumbers
  );

  let mongoSupplement = null;
  if (mongoCalls || mongoSms) {
    mongoSupplement = summarizeMongoTelnyxCosts(
      mongoCalls || [],
      mongoSms || [],
      activeNumbers || [],
      effectiveStart,
      effectiveEnd
    );
    calls = pickHigherSummary(calls, mongoSupplement.calls);
    sms = pickHigherSummary(sms, mongoSupplement.sms);
    if (mongoSupplement.numbers.totalCost > numbers.totalCost) {
      numbers.totalCost = mongoSupplement.numbers.totalCost;
      numbers.monthlyCost = mongoSupplement.numbers.monthlyCost;
      numbers.byDay = mongoSupplement.numbers.byDay;
      numbers.activeMs = mongoSupplement.numbers.activeMs;
    }
  }

  const byDay = mergeTelnyxDayMaps(calls.byDay, sms.byDay, numbers.byDay);
  const totalTelnyxCost = calls.totalCost + sms.totalCost + numbers.totalCost;

  const payload = {
    success: true,
    source: telnyx ? "telnyx_api" : "inventory",
    fetchedAt: new Date().toISOString(),
    lookbackCapped,
    period: {
      startDate: effectiveStart.toISOString(),
      endDate: effectiveEnd.toISOString(),
    },
    recordTypeStats,
    usageStats,
    calls,
    sms,
    numbers,
    totalTelnyxCost,
    byDay,
    mongoSupplementUsed: Boolean(mongoSupplement),
  };

  if (!mongoCalls && !mongoSms) {
    summaryCache.set(key, { fetchedAt: Date.now(), payload });
  }

  return payload;
}

export function serializeTelnyxDayMap(byDay) {
  return Array.from(byDay.entries())
    .map(([date, values]) => ({
      date,
      telnyxCallCost: parseFloat((values.telnyxCallCost || 0).toFixed(4)),
      telnyxSmsCost: parseFloat((values.telnyxSmsCost || 0).toFixed(4)),
      telnyxNumberCost: parseFloat((values.telnyxNumberCost || 0).toFixed(4)),
      totalTelnyxCost: parseFloat((values.totalTelnyxCost || 0).toFixed(4)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
