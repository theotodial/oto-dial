/**
 * In-process billing trace ring buffer for debugging and admin visibility.
 * Not durable across restarts — pair with CreditLedger for authoritative history.
 */

const MAX_TRACES = 2000;
const traces = [];
let duplicateSkipCount = 0;
let ledgerWriteFailureCount = 0;
const recentDuplicateKeys = [];

function pushRecentKey(key) {
  recentDuplicateKeys.unshift(String(key || "").slice(0, 200));
  if (recentDuplicateKeys.length > 50) recentDuplicateKeys.pop();
}

/**
 * @param {object} row
 * @param {string} row.userId
 * @param {string|null} [row.callId]
 * @param {string|null} [row.smsId]
 * @param {string} row.idempotencyKey
 * @param {number|null} [row.beforeBalance]
 * @param {number|null} [row.afterBalance]
 * @param {string} row.eventType
 * @param {string} row.sourceService
 * @param {boolean} [row.duplicate]
 * @param {string} [row.status]
 */
export function recordBillingTrace(row) {
  const entry = {
    at: new Date().toISOString(),
    ...row,
  };
  traces.unshift(entry);
  if (traces.length > MAX_TRACES) traces.length = MAX_TRACES;
}

export function recordDuplicateBillingSkip(idempotencyKey, meta = {}) {
  duplicateSkipCount += 1;
  pushRecentKey(idempotencyKey);
  recordBillingTrace({
    userId: meta.userId != null ? String(meta.userId) : null,
    callId: meta.callId != null ? String(meta.callId) : null,
    smsId: meta.smsId != null ? String(meta.smsId) : null,
    idempotencyKey: String(idempotencyKey || ""),
    beforeBalance: meta.beforeBalance ?? null,
    afterBalance: meta.afterBalance ?? null,
    eventType: meta.type || "duplicate_skip",
    sourceService: meta.sourceService || "unknown",
    duplicate: true,
    status: "duplicate_skipped",
  });
}

export function recordLedgerWriteFailure(err, meta = {}) {
  ledgerWriteFailureCount += 1;
  recordBillingTrace({
    userId: meta.userId != null ? String(meta.userId) : null,
    callId: meta.callId != null ? String(meta.callId) : null,
    smsId: meta.smsId != null ? String(meta.smsId) : null,
    idempotencyKey: String(meta.idempotencyKey || ""),
    beforeBalance: null,
    afterBalance: null,
    eventType: meta.type || "ledger_write_error",
    sourceService: meta.sourceService || "unknown",
    duplicate: false,
    status: "error",
    error: err?.message || String(err),
  });
}

export function getBillingTraceSnapshot({ limit = 120 } = {}) {
  return {
    traces: traces.slice(0, Math.max(1, Math.min(limit, 500))),
    duplicateSkipCount,
    ledgerWriteFailureCount,
    recentDuplicateKeys: [...recentDuplicateKeys],
  };
}

export function resetBillingTraceCounters() {
  duplicateSkipCount = 0;
  ledgerWriteFailureCount = 0;
  recentDuplicateKeys.length = 0;
}
