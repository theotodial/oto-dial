/**
 * Aggregates Telnyx costs from webhook-backed Call/SMS/PhoneNumber records,
 * merged with the TelnyxCost ledger and Telnyx API sync fields.
 */

const DEFAULT_MONTHLY_COST_PER_NUMBER = 2.0;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseTelnyxWebhookCallCost(payload) {
  if (!payload || typeof payload !== "object") return null;

  const candidates = [
    payload.cost,
    payload.total_cost,
    payload.call_cost,
    payload.billing?.cost,
    payload.billing?.total_cost,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

export function getCallTelnyxCost(call) {
  if (call?.costSyncedAt) {
    return toNumber(call?.cost) + toNumber(call?.carrierFee);
  }

  const carrierCost = toNumber(call?.carrierCost);
  if (carrierCost > 0) return carrierCost;

  return toNumber(call?.cost) + toNumber(call?.carrierFee);
}

export function getSmsTelnyxCost(sms) {
  if (sms?.costSyncedAt) {
    return toNumber(sms?.cost) + toNumber(sms?.carrierFees);
  }

  return toNumber(sms?.cost) + toNumber(sms?.carrierFees);
}

export function buildLedgerCostMap(ledgerRows) {
  const map = new Map();
  for (const row of ledgerRows || []) {
    if (!row?._id) continue;
    map.set(String(row._id), toNumber(row.totalCost));
  }
  return map;
}

export function sumLedgerRows(ledgerRows = []) {
  return ledgerRows.reduce((sum, row) => sum + toNumber(row.totalCost), 0);
}

export function ledgerDirectionTotals(ledgerRows = []) {
  const totals = { inbound: 0, outbound: 0, total: 0 };
  for (const row of ledgerRows || []) {
    const amount = toNumber(row.totalCost);
    totals.total += amount;
    if (row._id === "inbound") totals.inbound += amount;
    else if (row._id === "outbound") totals.outbound += amount;
  }
  return totals;
}

function resolveRecordCost(recordCost, ledgerCost, syncedAt) {
  if (syncedAt) return recordCost;
  if (recordCost > 0 && ledgerCost > 0) return Math.max(recordCost, ledgerCost);
  if (recordCost > 0) return recordCost;
  return ledgerCost > 0 ? ledgerCost : 0;
}

function scaleDirectionCosts(summary, targetTotal) {
  const currentTotal = toNumber(summary.inboundCost) + toNumber(summary.outboundCost);
  if (targetTotal <= 0 || currentTotal <= 0) {
    return {
      inboundCost: targetTotal / 2,
      outboundCost: targetTotal / 2,
      totalCost: targetTotal,
    };
  }

  const ratio = targetTotal / currentTotal;
  return {
    inboundCost: summary.inboundCost * ratio,
    outboundCost: summary.outboundCost * ratio,
    totalCost: targetTotal,
  };
}

export function mergeCategoryCosts(recordSummary, ledgerTotal, ledgerDirection = null) {
  const recordTotal = toNumber(recordSummary?.totalCost);
  const mergedTotal = Math.max(recordTotal, toNumber(ledgerTotal));

  if (mergedTotal <= 0) {
    return {
      ...recordSummary,
      totalCost: 0,
      inboundCost: 0,
      outboundCost: 0,
    };
  }

  if (ledgerTotal > recordTotal && ledgerDirection?.total > 0) {
    const inboundShare = ledgerDirection.inbound / ledgerDirection.total;
    const outboundShare = ledgerDirection.outbound / ledgerDirection.total;
    return {
      ...recordSummary,
      totalCost: mergedTotal,
      inboundCost: mergedTotal * inboundShare,
      outboundCost: mergedTotal * outboundShare,
    };
  }

  if (mergedTotal > recordTotal && recordTotal > 0) {
    const scaled = scaleDirectionCosts(recordSummary, mergedTotal);
    return {
      ...recordSummary,
      ...scaled,
    };
  }

  return {
    ...recordSummary,
    totalCost: mergedTotal,
  };
}

export function aggregateCallCosts(calls = [], ledgerByResourceId = new Map()) {
  const result = {
    totalCost: 0,
    inboundCost: 0,
    outboundCost: 0,
    totalBilledSeconds: 0,
    totalRingingSeconds: 0,
    totalAnsweredSeconds: 0,
    pendingCosts: 0,
    apiSyncedCount: 0,
  };

  for (const call of calls) {
    const recordCost = getCallTelnyxCost(call);
    const ledgerCost = ledgerByResourceId.get(String(call._id)) || 0;
    const callCost = resolveRecordCost(recordCost, ledgerCost, call.costSyncedAt);

    const billedSecs =
      toNumber(call.billedSeconds) ||
      toNumber(call.durationSeconds) ||
      toNumber(call.duration);
    const ringingSecs = toNumber(call.ringingDuration);
    const answeredSecs =
      toNumber(call.answeredDuration) ||
      Math.max(0, billedSecs - ringingSecs);

    result.totalCost += callCost;
    result.totalBilledSeconds += billedSecs;
    result.totalRingingSeconds += ringingSecs;
    result.totalAnsweredSeconds += answeredSecs;

    if (call.direction === "inbound") {
      result.inboundCost += callCost;
    } else if (call.direction === "outbound") {
      result.outboundCost += callCost;
    }

    if (call.costSyncedAt) {
      result.apiSyncedCount += 1;
    }

    const hasUsage =
      billedSecs > 0 ||
      ["answered", "in-progress", "completed"].includes(
        String(call.status || "").toLowerCase()
      );
    if (hasUsage && callCost <= 0 && !call.costSyncedAt) {
      result.pendingCosts += 1;
    }
  }

  return result;
}

export function aggregateSmsCosts(smsList = [], ledgerByResourceId = new Map()) {
  const result = {
    totalCost: 0,
    inboundCost: 0,
    outboundCost: 0,
    carrierFees: 0,
    count: 0,
    pendingCosts: 0,
    apiSyncedCount: 0,
  };

  for (const sms of smsList) {
    const recordCost = getSmsTelnyxCost(sms);
    const ledgerCost = ledgerByResourceId.get(String(sms._id)) || 0;
    const smsCost = resolveRecordCost(recordCost, ledgerCost, sms.costSyncedAt);
    const carrierFee = toNumber(sms.carrierFees);

    result.totalCost += smsCost;
    result.carrierFees += carrierFee;
    result.count += 1;

    if (sms.direction === "inbound") {
      result.inboundCost += smsCost;
    } else if (sms.direction === "outbound") {
      result.outboundCost += smsCost;
    }

    if (sms.costSyncedAt) {
      result.apiSyncedCount += 1;
    }

    if (smsCost <= 0 && !sms.costSyncedAt && sms.status !== "failed") {
      result.pendingCosts += 1;
    }
  }

  return result;
}

export function aggregateNumberCosts(numbers = [], startDate, endDate) {
  const periodStart = startDate || new Date(0);
  const periodEnd = endDate || new Date();
  const millisecondsInPeriod = Math.max(0, periodEnd - periodStart);
  const fractionalDays = millisecondsInPeriod / (1000 * 60 * 60 * 24);

  const result = {
    totalCost: 0,
    oneTimeCost: 0,
    extraFees: 0,
    monthlyCost: 0,
    activeCount: numbers.length,
  };

  for (const number of numbers) {
    const monthlyCost =
      toNumber(number.monthlyCost) > 0
        ? toNumber(number.monthlyCost)
        : DEFAULT_MONTHLY_COST_PER_NUMBER;
    const oneTimeFees = toNumber(number.oneTimeFees);
    const extraFees = toNumber(number.extraFees);

    const numberCreatedAt = number.createdAt ? new Date(number.createdAt) : new Date();
    const numberActiveStart =
      numberCreatedAt > periodStart ? numberCreatedAt : periodStart;
    const activeMs = Math.max(0, periodEnd - numberActiveStart);
    const activeFractionalDays = activeMs / (1000 * 60 * 60 * 24);
    const periodCost = (monthlyCost / 30) * activeFractionalDays;

    result.totalCost += periodCost + oneTimeFees + extraFees;
    result.oneTimeCost += oneTimeFees;
    result.extraFees += extraFees;
    result.monthlyCost += monthlyCost;
  }

  const daysInPeriod = Math.max(
    fractionalDays,
    Math.ceil(millisecondsInPeriod / (1000 * 60 * 60 * 24)) || 1
  );
  result.monthlyCostForPeriod = result.totalCost;
  result.estimatedMonthlyCost =
    daysInPeriod > 0 ? (result.totalCost * 30) / daysInPeriod : result.monthlyCost;

  return result;
}

export function groupCallCostsByDay(calls = [], ledgerByResourceId = new Map()) {
  const byDay = new Map();

  for (const call of calls) {
    if (!call?.createdAt) continue;
    const dayKey = new Date(call.createdAt).toISOString().split("T")[0];
    const entry = byDay.get(dayKey) || { callCost: 0, callMinutes: 0, calls: 0 };

    const recordCost = getCallTelnyxCost(call);
    const ledgerCost = ledgerByResourceId.get(String(call._id)) || 0;
    entry.callCost += resolveRecordCost(recordCost, ledgerCost, call.costSyncedAt);

    entry.calls += 1;
    if (call.billedMinutes) {
      entry.callMinutes += toNumber(call.billedMinutes);
    } else if (call.billedSeconds) {
      entry.callMinutes += toNumber(call.billedSeconds) / 60;
    } else if (call.durationSeconds) {
      entry.callMinutes += toNumber(call.durationSeconds) / 60;
    }
    byDay.set(dayKey, entry);
  }

  return byDay;
}

export function groupSmsCostsByDay(smsList = [], ledgerByResourceId = new Map()) {
  const byDay = new Map();

  for (const sms of smsList) {
    if (!sms?.createdAt) continue;
    const dayKey = new Date(sms.createdAt).toISOString().split("T")[0];
    const entry = byDay.get(dayKey) || { smsCost: 0, sms: 0 };

    const recordCost = getSmsTelnyxCost(sms);
    const ledgerCost = ledgerByResourceId.get(String(sms._id)) || 0;
    entry.smsCost += resolveRecordCost(recordCost, ledgerCost, sms.costSyncedAt);

    entry.sms += 1;
    byDay.set(dayKey, entry);
  }

  return byDay;
}
