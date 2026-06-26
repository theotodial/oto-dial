/**
 * Human-readable labels for CreditLedger rows (admin explorer + customer timeline).
 */

const TYPE_LABELS = {
  subscription_credit_grant: "Monthly Grant",
  add_on_purchase: "Credit Pack Purchase",
  outbound_attempt_charge: "Outbound Attempt",
  call_event_charge: "Call Event",
  connected_duration_charge: "Connected Call",
  sms_charge: "SMS",
  admin_adjustment: "Admin Adjustment",
  refund: "Refund",
  migration_conversion: "Migration Conversion",
  migration_reset: "Migration Reset",
  failed_reservation_release: "Reservation Release",
  reservation_hold: "Reservation Hold",
  risk_pricing_adjustment: "Risk Pricing",
};

const EVENT_LABELS = {
  routed: "Routed",
  ringing: "Ringing",
  busy: "Busy",
  no_answer: "No Answer",
  failed_after_routing: "Failed",
  answered: "Answered",
  carrier_reject_before_routing: "Carrier Reject",
};

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function formatCredits(amount) {
  const n = num(amount);
  const abs = Math.abs(n);
  const formatted = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/\.?0+$/, "");
  return n >= 0 ? `+${formatted}` : `-${formatted}`;
}

/**
 * Derive a short display label for a ledger row.
 */
export function formatLedgerLabel(row) {
  const type = String(row?.type || "");
  const reason = String(row?.reason || "");
  const meta = row?.metadata || {};

  if (type === "call_event_charge") {
    const eventName = meta.eventName || meta.event || reason.replace(/^call_event_/, "");
    const eventLabel = EVENT_LABELS[eventName] || eventName || "Call Event";
    return eventLabel;
  }

  if (type === "connected_duration_charge") {
    const secs = meta.connectedSeconds ?? meta.bucketSeconds ?? meta.seconds;
    if (secs) return `Connected Call (${secs}s)`;
    return "Connected Call";
  }

  if (type === "sms_charge") {
    const parts = meta.segments ?? meta.smsParts;
    const enc = meta.encoding ? ` ${meta.encoding}` : "";
    if (parts) return `SMS (${parts} segment${parts === 1 ? "" : "s"}${enc})`;
    return "SMS";
  }

  if (type === "subscription_credit_grant") {
    const plan = meta.planName || meta.planKey;
    return plan ? `Monthly Grant (${plan})` : "Monthly Grant";
  }

  if (type === "add_on_purchase") {
    const qty = meta.quantity ?? meta.credits;
    return qty ? `Credit Pack (+${qty})` : "Credit Pack Purchase";
  }

  if (type === "failed_reservation_release") {
    if (meta.economicSettle) return "Reservation Settled";
    return "Reservation Released";
  }

  if (type === "reservation_hold") {
    return "Call Reservation Hold";
  }

  if (reason && reason !== type) {
    const fromReason = reason
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return fromReason;
  }

  return TYPE_LABELS[type] || type || "Credit Event";
}

/**
 * Billing status for admin explorer.
 */
export function deriveBillingStatus(row) {
  const type = String(row?.type || "");
  if (type === "reservation_hold") return "reserved";
  if (type === "failed_reservation_release") {
    return row?.metadata?.economicSettle ? "settled" : "released";
  }
  if (num(row?.amount) < 0) return "charged";
  if (num(row?.amount) > 0) return "credited";
  return "neutral";
}

/**
 * Enrich a raw CreditLedger lean doc for admin explorer / customer timeline.
 */
export function enrichLedgerRow(row, context = {}) {
  const amount = num(row.amount);
  const label = formatLedgerLabel(row);
  const callMap = context.callMap || {};
  const telnyxId =
    context.telnyxCallId ||
    (row.callId ? callMap[String(row.callId)]?.telnyxCallControlId : null) ||
    row.metadata?.telnyxCallControlId ||
    null;

  return {
    id: String(row._id),
    userId: row.user ? String(row.user) : null,
    callId: row.callId ? String(row.callId) : null,
    smsId: row.smsId ? String(row.smsId) : null,
    callEvent: row.metadata?.eventName || row.metadata?.event || null,
    type: row.type,
    amount,
    creditsDisplay: formatCredits(amount),
    label,
    remainingBalance: num(row.balanceAfter),
    balanceBefore: num(row.balanceBefore),
    timestamp: row.createdAt,
    reason: row.reason || label,
    telnyxCallId: telnyxId,
    billingStatus: deriveBillingStatus(row),
    direction: row.direction || null,
    idempotencyKey: row.idempotencyKey || null,
    metadata: row.metadata || {},
  };
}

export { TYPE_LABELS, EVENT_LABELS, formatCredits };
