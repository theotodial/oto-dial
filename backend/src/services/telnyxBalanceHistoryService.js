import getTelnyxClient from "./telnyxService.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";
import { ACTIVE_PHONE_NUMBER_QUERY } from "./telnyxBillingReportService.js";
import { getTelnyxNumberMonthlyUsd } from "./telnyxBillingReportService.js";

const DEPOSIT_LOOKBACK_MS = 730 * 24 * 60 * 60 * 1000;
const MAX_AUDIT_PAGES = 50;
const MAX_PAYMENT_TX_PAGES = 20;
const MAX_INVOICE_PAGES = 20;
const CHARGES_CHUNK_DAYS = 31;

const DEPOSIT_KEYWORDS = [
  "payment",
  "recharge",
  "balance",
  "credit",
  "deposit",
  "top-up",
  "topup",
  "stored_payment",
  "auto_recharge",
  "funds",
];

function parseMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundUsd(value) {
  return parseFloat(Number(value || 0).toFixed(4));
}

function telnyxChargeUsd(value) {
  const n = parseMoney(value);
  if (n == null) return 0;
  return roundUsd(Math.abs(n));
}

function unwrapTelnyxPayload(response) {
  if (!response) return null;
  if (response.data && typeof response.data === "object" && !Array.isArray(response.data)) {
    return response.data;
  }
  return response;
}

function getChargesBreakdownResults(response) {
  const payload = unwrapTelnyxPayload(response);
  return Array.isArray(payload?.results) ? payload.results : [];
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

async function telnyxRawGet(path, query = {}) {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) return { ok: false, status: 0, error: "Telnyx API key not configured" };

  const url = new URL(`https://api.telnyx.com/v2/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const body = await res.json();
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || "Request failed" };
  }
}

function isDepositLikeAuditEvent(event) {
  const haystack = [
    event?.change_type,
    event?.record_type,
    ...(event?.changes || []).map((c) => c?.field),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!DEPOSIT_KEYWORDS.some((kw) => haystack.includes(kw))) return false;

  for (const change of event?.changes || []) {
    const toVal = parseMoney(change?.to);
    const fromVal = parseMoney(change?.from);
    if (toVal != null && toVal > 0 && (fromVal == null || toVal > fromVal)) return true;
    if (String(change?.field || "").toLowerCase().includes("amount") && toVal > 0) return true;
  }

  return DEPOSIT_KEYWORDS.some((kw) => haystack.includes(kw));
}

function extractAuditDepositAmount(event) {
  for (const change of event?.changes || []) {
    const field = String(change?.field || "").toLowerCase();
    const toVal = parseMoney(change?.to);
    const fromVal = parseMoney(change?.from);
    if (field.includes("amount") && toVal > 0) return toVal;
    if (field.includes("balance") && toVal != null && fromVal != null && toVal > fromVal) {
      return roundUsd(toVal - fromVal);
    }
  }
  return null;
}

async function fetchStoredPaymentTransactions() {
  const entries = [];
  let page = 1;
  let sourceAvailable = false;
  let lastError = null;

  while (page <= MAX_PAYMENT_TX_PAGES) {
    const result = await telnyxRawGet("payment/stored_payment_transactions", {
      "page[number]": page,
      "page[size]": 100,
    });

    if (!result.ok) {
      lastError = result.error || `HTTP ${result.status}`;
      break;
    }

    sourceAvailable = true;
    const batch = Array.isArray(result.body?.data) ? result.body.data : [];
    for (const row of batch) {
      const amountCents = Number(row?.amount_cents);
      const amount =
        Number.isFinite(amountCents) && amountCents > 0
          ? roundUsd(amountCents / 100)
          : parseMoney(row?.amount);
      if (!amount || amount <= 0) continue;

      entries.push({
        id: row?.id || `payment-tx-${page}-${entries.length}`,
        at: row?.created_at || null,
        amount,
        currency: row?.amount_currency || "USD",
        type: row?.auto_recharge ? "auto_recharge" : "manual_deposit",
        source: "stored_payment_transaction",
        description: row?.auto_recharge
          ? "Auto-recharge payment"
          : "Stored payment transaction",
        status: row?.processor_status || null,
        metadata: {
          transactionProcessingType: row?.transaction_processing_type || null,
        },
      });
    }

    const totalPages = Number(result.body?.meta?.total_pages || 0);
    if (!totalPages || page >= totalPages || batch.length === 0) break;
    page += 1;
  }

  return { entries, sourceAvailable, error: sourceAvailable ? null : lastError };
}

async function fetchAuditDepositEvents(since) {
  const telnyx = getTelnyxClient();
  if (!telnyx) return { entries: [], sourceAvailable: false, error: "Telnyx API key not configured" };

  const entries = [];
  let page = 1;

  while (page <= MAX_AUDIT_PAGES) {
    let response;
    try {
      response = await telnyx.auditEvents.list({
        filter: { created_after: since.toISOString() },
        page: { number: page, size: 100 },
        sort: "desc",
      });
    } catch (err) {
      return { entries, sourceAvailable: entries.length > 0, error: err?.message || "Audit fetch failed" };
    }

    const batch = Array.isArray(response?.data) ? response.data : [];
    for (const event of batch) {
      if (!isDepositLikeAuditEvent(event)) continue;
      const amount = extractAuditDepositAmount(event);
      entries.push({
        id: event?.id || `audit-${page}-${entries.length}`,
        at: event?.created_at || null,
        amount: amount != null ? roundUsd(amount) : null,
        currency: "USD",
        type: "audit_event",
        source: "audit_event",
        description: event?.change_type || event?.record_type || "Account balance change",
        status: event?.change_made_by || null,
        metadata: {
          recordType: event?.record_type || null,
          resourceId: event?.resource_id || null,
        },
      });
    }

    const totalPages = Number(response?.meta?.total_pages || 0);
    if (!totalPages || page >= totalPages || batch.length === 0) break;
    page += 1;
  }

  return { entries, sourceAvailable: true, error: null };
}

function monthRanges(since, until) {
  const ranges = [];
  let cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1));
  const end = new Date(until);

  while (cursor < end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    ranges.push({
      start: new Date(cursor),
      end: new Date(Math.min(next.getTime(), end.getTime())),
      startKey: formatDayKey(cursor),
      endKey: formatDayKey(next),
    });
    cursor = next;
  }

  return ranges;
}

async function fetchMonthlyBalanceCredits(since, until) {
  const telnyx = getTelnyxClient();
  if (!telnyx) return { entries: [], sourceAvailable: false, error: "Telnyx API key not configured" };

  const entries = [];
  const ranges = monthRanges(since, until);
  let monthsFetched = 0;
  let lastError = null;

  for (const range of ranges) {
    if (!range.startKey || !range.endKey) continue;
    try {
      const response = await telnyx.chargesSummary.retrieve({
        start_date: range.startKey,
        end_date: range.endKey,
      });
      monthsFetched += 1;
      const data = unwrapTelnyxPayload(response) || {};
      const credits = telnyxChargeUsd(data?.total?.credits);
      if (credits <= 0) continue;

      entries.push({
        id: `credit-${range.startKey}`,
        at: `${range.startKey}T00:00:00.000Z`,
        amount: credits,
        currency: data.currency || "USD",
        type: "balance_credit",
        source: "charges_summary",
        description: `Balance credit (${data.start_date || range.startKey} → ${data.end_date || range.endKey})`,
        status: "credited",
        metadata: {
          periodStart: data.start_date || range.startKey,
          periodEnd: data.end_date || range.endKey,
        },
      });

      for (const adj of data?.summary?.adjustments || []) {
        const amount = telnyxChargeUsd(adj?.amount);
        if (amount <= 0) continue;
        const eventDate = adj?.event_date || range.startKey;
        entries.push({
          id: `adj-${eventDate}-${adj?.description || "credit"}-${entries.length}`,
          at: eventDate.includes("T") ? eventDate : `${eventDate}T12:00:00.000Z`,
          amount,
          currency: data.currency || "USD",
          type: "billing_adjustment",
          source: "charges_summary",
          description: adj?.description || "Billing adjustment",
          status: "credited",
          metadata: { periodStart: data.start_date, periodEnd: data.end_date },
        });
      }
    } catch (err) {
      lastError = err?.message || "Charges summary fetch failed";
    }
  }

  return {
    entries,
    sourceAvailable: monthsFetched > 0,
    error: monthsFetched > 0 ? null : lastError,
    monthsFetched,
    monthsTotal: ranges.length,
  };
}

async function fetchInvoiceDepositEntries() {
  const telnyx = getTelnyxClient();
  if (!telnyx) return { entries: [], sourceAvailable: false, error: "Telnyx API key not configured" };

  const entries = [];
  let page = 1;

  while (page <= MAX_INVOICE_PAGES) {
    let response;
    try {
      response = await telnyx.invoices.list({
        page: { number: page, size: 50 },
        sort: "-period_start",
      });
    } catch (err) {
      return { entries, sourceAvailable: entries.length > 0, error: err?.message || "Invoice fetch failed" };
    }

    const batch = Array.isArray(response?.data) ? response.data : [];
    for (const invoice of batch) {
      entries.push({
        id: invoice?.invoice_id || `invoice-${page}-${entries.length}`,
        at: invoice?.period_end ? `${invoice.period_end}T23:59:59.000Z` : null,
        amount: null,
        currency: "USD",
        type: "invoice",
        source: "invoice",
        description: `Invoice ${invoice?.period_start || "?"} → ${invoice?.period_end || "?"}${invoice?.paid ? " (paid)" : ""}`,
        status: invoice?.paid ? "paid" : "unpaid",
        metadata: {
          invoiceId: invoice?.invoice_id || null,
          periodStart: invoice?.period_start || null,
          periodEnd: invoice?.period_end || null,
          url: invoice?.url || null,
        },
      });
    }

    const totalPages = Number(response?.meta?.total_pages || 0);
    if (!totalPages || page >= totalPages || batch.length === 0) break;
    page += 1;
  }

  return { entries, sourceAvailable: true, error: null };
}

function depositDedupeKey(entry) {
  if (entry.source === "invoice") return `invoice|${entry.id}`;
  const day = formatDayKey(entry.at) || "unknown";
  const amountKey = entry.amount != null ? entry.amount.toFixed(2) : "na";
  const typeKey = entry.type || entry.source || "unknown";
  return `${day}|${amountKey}|${typeKey}|${entry.description || ""}`;
}

function mergeDepositEntries(groups) {
  const byKey = new Map();
  const sourcePriority = {
    stored_payment_transaction: 5,
    billing_adjustment: 4,
    audit_event: 3,
    balance_credit: 2,
    invoice: 1,
    charges_summary: 2,
  };

  for (const group of groups) {
    for (const entry of group.entries || []) {
      const key = depositDedupeKey(entry);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, entry);
        continue;
      }
      const existingPriority = sourcePriority[existing.source] || 0;
      const nextPriority = sourcePriority[entry.source] || 0;
      if (nextPriority > existingPriority) {
        byKey.set(key, entry);
        continue;
      }
      if (nextPriority === existingPriority && entry.at && existing.at && entry.at > existing.at) {
        byKey.set(key, entry);
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });
}

export async function buildTelnyxBalanceDepositHistory() {
  const until = new Date();
  const since = new Date(until.getTime() - DEPOSIT_LOOKBACK_MS);

  const [payments, audit, credits, invoices] = await Promise.all([
    fetchStoredPaymentTransactions(),
    fetchAuditDepositEvents(since),
    fetchMonthlyBalanceCredits(since, until),
    fetchInvoiceDepositEntries(),
  ]);

  const deposits = mergeDepositEntries([payments, audit, credits, invoices]).filter(
    (row) => row.amount == null || row.amount > 0
  );
  const totalDeposited = roundUsd(
    deposits.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );

  const sources = [
    payments.sourceAvailable && { id: "stored_payment_transaction", label: "Payment transactions", count: payments.entries.length },
    audit.sourceAvailable && { id: "audit_event", label: "Audit events", count: audit.entries.length },
    credits.sourceAvailable && { id: "charges_summary", label: "Monthly balance credits", count: credits.entries.length },
    invoices.sourceAvailable && { id: "invoice", label: "Invoices", count: invoices.entries.length },
  ].filter(Boolean);

  return {
    available: deposits.length > 0 || sources.length > 0,
    fetchedAt: until.toISOString(),
    lookbackStart: since.toISOString(),
    lookbackEnd: until.toISOString(),
    lookbackDays: Math.round(DEPOSIT_LOOKBACK_MS / (24 * 60 * 60 * 1000)),
    totalDeposited,
    depositCount: deposits.length,
    deposits,
    sources,
    notes: [
      !payments.sourceAvailable
        ? "Telnyx payment transaction history is not available via list API; monthly balance credits from billing summaries are used."
        : null,
      credits.monthsFetched < credits.monthsTotal
        ? `Monthly credits loaded for ${credits.monthsFetched}/${credits.monthsTotal} billing periods.`
        : null,
      deposits.some((row) => row.source === "charges_summary" && String(row.at || "").endsWith("T00:00:00.000Z"))
        ? "Credit timestamps reflect billing period start when Telnyx does not expose exact deposit time."
        : null,
    ].filter(Boolean),
    errors: [payments.error, audit.error, credits.error, invoices.error].filter(Boolean),
  };
}

async function fetchCurrentChargesSummary() {
  const telnyx = getTelnyxClient();
  if (!telnyx) return { available: false, error: "Telnyx API key not configured" };

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  try {
    const response = await telnyx.chargesSummary.retrieve({
      start_date: formatDayKey(monthStart),
      end_date: formatDayKey(nextMonthStart),
    });
    const data = unwrapTelnyxPayload(response) || {};
    const total = data.total || {};
    return {
      available: true,
      periodStart: data.start_date || formatDayKey(monthStart),
      periodEnd: data.end_date || formatDayKey(nextMonthStart),
      currency: data.currency || "USD",
      newMrc: telnyxChargeUsd(total.new_mrc),
      newOtc: telnyxChargeUsd(total.new_otc),
      existingMrc: telnyxChargeUsd(total.existing_mrc),
      ledgerAdjustments: telnyxChargeUsd(total.ledger_adjustments),
      credits: telnyxChargeUsd(total.credits),
      other: telnyxChargeUsd(total.other),
      grandTotal: telnyxChargeUsd(total.grand_total),
      lines: (data.summary?.lines || []).map((line) => ({
        name: line.name,
        alias: line.alias,
        type: line.type,
        amount: line.type === "simple" ? telnyxChargeUsd(line.amount) : null,
        quantity: line.type === "simple" ? Number(line.quantity || 0) : null,
        newThisMonthMrc:
          line.type === "comparative" ? telnyxChargeUsd(line.new_this_month?.mrc) : null,
        newThisMonthOtc:
          line.type === "comparative" ? telnyxChargeUsd(line.new_this_month?.otc) : null,
        existingThisMonthMrc:
          line.type === "comparative" ? telnyxChargeUsd(line.existing_this_month?.mrc) : null,
      })),
    };
  } catch (err) {
    return { available: false, error: err?.message || "Failed to fetch charges summary" };
  }
}

async function fetchNumberRenewalBreakdown(start, end) {
  const telnyx = getTelnyxClient();
  if (!telnyx) return { available: false, error: "Telnyx API key not configured" };

  const startDate = formatDayKey(start);
  const endDate = formatDayKey(end);
  if (!startDate || !endDate) {
    return { available: false, error: "Invalid billing period" };
  }

  try {
    const response = await telnyx.chargesBreakdown.retrieve({ start_date: startDate, end_date: endDate });
    const results = getChargesBreakdownResults(response);
    let monthlyMrc = 0;
    let partialMrc = 0;
    let oneTime = 0;
    const numbers = [];

    for (const row of results) {
      let rowMrc = 0;
      let rowPartial = 0;
      let rowOtc = 0;
      for (const service of row?.services || []) {
        const cost = telnyxChargeUsd(service?.cost);
        const costType = String(service?.cost_type || "").toLowerCase();
        if (costType === "mrc") {
          rowMrc += cost;
          monthlyMrc += cost;
        } else if (costType.includes("partial")) {
          rowPartial += cost;
          partialMrc += cost;
        } else if (costType === "otc") {
          rowOtc += cost;
          oneTime += cost;
        }
      }
      numbers.push({
        phoneNumber: row?.tn || null,
        monthlyMrc: roundUsd(rowMrc),
        partialMrc: roundUsd(rowPartial),
        oneTime: roundUsd(rowOtc),
        total: roundUsd(rowMrc + rowPartial + rowOtc),
      });
    }

    return {
      available: true,
      periodStart: startDate,
      periodEnd: endDate,
      numberCount: numbers.length,
      monthlyMrc: roundUsd(monthlyMrc),
      partialMrc: roundUsd(partialMrc),
      oneTime: roundUsd(oneTime),
      totalRenewalEstimate: roundUsd(monthlyMrc + partialMrc + oneTime),
      numbers,
    };
  } catch (err) {
    return { available: false, error: err?.message || "Failed to fetch number renewal breakdown" };
  }
}

async function fetchAutoRechargePrefs() {
  const telnyx = getTelnyxClient();
  if (!telnyx) return { available: false, error: "Telnyx API key not configured" };

  try {
    const response = await telnyx.payment.autoRechargePrefs.list();
    const data = response?.data || {};
    return {
      available: true,
      enabled: Boolean(data.enabled),
      invoiceEnabled: Boolean(data.invoice_enabled),
      preference: data.preference || null,
      thresholdAmount: parseMoney(data.threshold_amount),
      rechargeAmount: parseMoney(data.recharge_amount),
    };
  } catch (err) {
    return { available: false, error: err?.message || "Failed to fetch auto-recharge prefs" };
  }
}

async function fetchLocalPendingCosts() {
  const pendingFilter = {
    $or: [{ costSyncedAt: null }, { costSyncedAt: { $exists: false } }],
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  };

  const [pendingCalls, pendingSms] = await Promise.all([
    Call.countDocuments(pendingFilter),
    SMS.countDocuments(pendingFilter),
  ]);

  return {
    pendingCallRecords: pendingCalls,
    pendingSmsRecords: pendingSms,
    note: "Recent records without Telnyx API cost sync (last 7 days). Actual pending Telnyx balance uses account pending charges.",
  };
}

async function fetchNumberMonthlyProjection() {
  const numbers = await PhoneNumber.find(ACTIVE_PHONE_NUMBER_QUERY).lean();
  const monthlyRate = getTelnyxNumberMonthlyUsd();
  const now = new Date();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const msRemaining = Math.max(0, monthEnd.getTime() - now.getTime());
  const msInMonth = 30 * 24 * 60 * 60 * 1000;

  let monthlyTotal = 0;
  let remainingEstimate = 0;
  for (const number of numbers) {
    const monthly = Number(number.monthlyCost) > 0 ? Number(number.monthlyCost) : monthlyRate;
    monthlyTotal += monthly;
    remainingEstimate += (monthly / msInMonth) * msRemaining;
  }

  return {
    activeCount: numbers.length,
    monthlyTotal: roundUsd(monthlyTotal),
    remainingPeriodEstimate: roundUsd(remainingEstimate),
    periodEndsAt: monthEnd.toISOString(),
  };
}

export async function buildTelnyxUpcomingCosts({ balance } = {}) {
  const fetchedAt = new Date().toISOString();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const followingMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));

  const [chargesSummary, autoRecharge, localPending, numberProjection, currentRenewal, nextRenewal] =
    await Promise.all([
      fetchCurrentChargesSummary(),
      fetchAutoRechargePrefs(),
      fetchLocalPendingCosts(),
      fetchNumberMonthlyProjection(),
      fetchNumberRenewalBreakdown(monthStart, nextMonthStart),
      fetchNumberRenewalBreakdown(nextMonthStart, followingMonthStart),
    ]);

  const balancePending = balance?.available ? telnyxChargeUsd(balance.pending) : null;
  const renewalSource = nextRenewal.available && nextRenewal.monthlyMrc > 0
    ? nextRenewal
    : currentRenewal.available
      ? currentRenewal
      : null;

  const monthlyNumberRenewal =
    renewalSource?.monthlyMrc > 0
      ? renewalSource.monthlyMrc
      : numberProjection.monthlyTotal;

  const projectedNewCharges = chargesSummary.available
    ? roundUsd(
        Number(chargesSummary.newMrc || 0) +
          Number(chargesSummary.newOtc || 0) +
          Number(chargesSummary.other || 0)
      )
    : null;

  const items = [];

  if (monthlyNumberRenewal > 0) {
    items.push({
      category: "numbers",
      label: "Monthly number renewal (MRC)",
      amount: roundUsd(monthlyNumberRenewal),
      detail: renewalSource
        ? `${renewalSource.numberCount} numbers · Telnyx charges breakdown${renewalSource === nextRenewal ? " (next billing period)" : " (current period)"}`
        : `${numberProjection.activeCount} numbers · estimated from inventory`,
      dueAt: nextMonthStart.toISOString(),
    });
  }

  if (renewalSource?.partialMrc > 0) {
    items.push({
      category: "numbers",
      label: "Prorated number charges (partial MRC)",
      amount: roundUsd(renewalSource.partialMrc),
      detail: "Mid-cycle number additions prorated to period end",
      dueAt: nextMonthStart.toISOString(),
    });
  }

  if (renewalSource?.oneTime > 0) {
    items.push({
      category: "numbers",
      label: "Number one-time charges (OTC)",
      amount: roundUsd(renewalSource.oneTime),
      detail: "New number setup / purchase fees in billing period",
    });
  }

  if (balancePending != null && balancePending > 0) {
    items.push({
      category: "account",
      label: "Telnyx pending balance",
      amount: roundUsd(balancePending),
      detail: "Charges already incurred but not yet settled on the Telnyx account.",
    });
  }

  if (chargesSummary.available && projectedNewCharges > 0) {
    items.push({
      category: "billing",
      label: "New charges this billing period",
      amount: projectedNewCharges,
      detail: `MRC ${formatUsd(chargesSummary.newMrc)} · OTC ${formatUsd(chargesSummary.newOtc)} · other ${formatUsd(chargesSummary.other)}`,
    });
  }

  if (chargesSummary.available && Number(chargesSummary.existingMrc || 0) > 0) {
    items.push({
      category: "billing",
      label: "Existing monthly recurring (current period)",
      amount: roundUsd(chargesSummary.existingMrc),
      detail: "Recurring services already on the account for this period.",
    });
  }

  if (numberProjection.remainingPeriodEstimate > 0 && !renewalSource?.monthlyMrc) {
    items.push({
      category: "numbers",
      label: "Estimated number cost (rest of month)",
      amount: numberProjection.remainingPeriodEstimate,
      detail: `${numberProjection.activeCount} active numbers · ${formatUsd(numberProjection.monthlyTotal)}/mo total`,
      dueAt: numberProjection.periodEndsAt,
    });
  }

  if (localPending.pendingCallRecords + localPending.pendingSmsRecords > 0) {
    items.push({
      category: "local",
      label: "Unsynced usage records (local)",
      amount: null,
      detail: `${localPending.pendingCallRecords} calls · ${localPending.pendingSmsRecords} SMS awaiting Telnyx cost sync`,
    });
  }

  const totalEstimated = roundUsd(
    items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  );

  return {
    available: Boolean(
      balance?.available ||
      chargesSummary.available ||
      renewalSource?.available ||
      numberProjection.monthlyTotal > 0
    ),
    fetchedAt,
    totalEstimated,
    items,
    balancePending: balancePending != null ? roundUsd(balancePending) : null,
    monthlyNumberRenewal: roundUsd(monthlyNumberRenewal),
    chargesSummary,
    autoRecharge,
    localPending,
    numberProjection,
    numberRenewal: renewalSource,
    nextNumberRenewal: nextRenewal.available ? nextRenewal : null,
    errors: [chargesSummary.error, autoRecharge.error, currentRenewal.error, nextRenewal.error].filter(Boolean),
  };
}

function formatUsd(value) {
  if (value == null || !Number.isFinite(Number(value))) return "$0.0000";
  return `$${Number(value).toFixed(4)}`;
}

export default {
  buildTelnyxBalanceDepositHistory,
  buildTelnyxUpcomingCosts,
};
