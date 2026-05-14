import mongoose from "mongoose";
import BillingEventJournal from "../models/BillingEventJournal.js";

/**
 * Append-only billing event journal. Never mutates user balance.
 * Duplicate eventId → no-op (idempotent, unique index on eventId).
 */

function normalizeObjectId(id) {
  if (id == null) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id);
  if (!s || s === "undefined" || s === "null") return null;
  if (mongoose.Types.ObjectId.isValid(s)) return new mongoose.Types.ObjectId(s);
  return null;
}

/**
 * Map CreditLedger row / applyBillingEvent context → journal fields.
 * @param {object} p
 * @param {string} p.type - CreditLedger.type
 * @param {string} p.idempotencyKey
 * @param {number} p.amount
 * @param {import("mongoose").Types.ObjectId|null} p.callId
 * @param {import("mongoose").Types.ObjectId|null} p.smsId
 * @param {import("mongoose").Types.ObjectId|string} p.userId
 * @param {object} p.metadata
 * @param {number} [p.reservedCreditsInc] - from applyBillingEvent (current attempt)
 */
export function mapCreditLedgerToJournalEvent(p) {
  const type = String(p.type || "");
  const idempotencyKey = String(p.idempotencyKey || "");
  const callId = normalizeObjectId(p.callId);
  const smsId = normalizeObjectId(p.smsId);
  const userId = normalizeObjectId(p.userId);
  const metadata = p.metadata && typeof p.metadata === "object" ? { ...p.metadata } : {};
  const reservedInc = Number.isFinite(Number(p.reservedCreditsInc)) ? Number(p.reservedCreditsInc) : 0;

  let entityType = "system";
  let entityId = null;
  let correlationId = null;

  if (smsId) {
    entityType = "sms";
    entityId = smsId;
    correlationId = smsId;
  } else if (callId) {
    entityType = "call";
    entityId = callId;
    correlationId = callId;
  } else if (type === "migration_conversion") {
    entityType = "migration";
    entityId = userId;
    correlationId = userId;
  } else if (
    type === "subscription_credit_grant" ||
    type === "add_on_purchase" ||
    type === "refund"
  ) {
    entityType = "stripe";
    entityId = null;
    correlationId = null;
  }

  let eventType = "adjustment";
  if (type === "reservation_hold") {
    eventType = "reserve";
    const hold = Number(metadata.hold);
    if (Number.isFinite(hold)) metadata.reservedDelta = hold;
    else if (reservedInc) metadata.reservedDelta = reservedInc;
  } else if (type === "failed_reservation_release") {
    if (idempotencyKey.startsWith("settle:")) {
      eventType = "settle";
    } else {
      eventType = "release";
    }
  } else if (type === "outbound_attempt_charge") {
    eventType = "attempt_charge";
  } else if (type === "connected_duration_charge") {
    eventType = "interval_charge";
  } else if (type === "sms_charge") {
    eventType = "sms_charge";
  } else if (type === "subscription_credit_grant" || type === "add_on_purchase" || type === "migration_conversion") {
    eventType = "grant";
  } else if (type === "refund") {
    eventType = "refund";
  } else if (type === "admin_adjustment" || type === "risk_pricing_adjustment") {
    eventType = "adjustment";
  }

  if (reservedInc && type === "reservation_hold" && metadata.reservedDelta == null) {
    metadata.reservedDelta = reservedInc;
  }

  return {
    entityType,
    entityId,
    correlationId,
    eventType,
    journalMetadata: metadata,
  };
}

/**
 * Build payload for appendBillingJournalEvent from applyBillingEvent context + persisted ledger row.
 */
export function buildJournalEntryFromApplyContext({
  userId,
  idempotencyKey,
  type,
  amount,
  sourceService,
  callId,
  smsId,
  metadata,
  reservedCreditsInc,
  ledger,
}) {
  const mapped = mapCreditLedgerToJournalEvent({
    type,
    idempotencyKey,
    amount,
    callId,
    smsId,
    userId,
    metadata,
    reservedCreditsInc,
  });
  const ts = ledger?.createdAt ? new Date(ledger.createdAt) : new Date();
  return {
    eventId: String(idempotencyKey || "").slice(0, 200),
    userId,
    entityType: mapped.entityType,
    entityId: mapped.entityId,
    eventType: mapped.eventType,
    amount: Number(amount) || 0,
    timestamp: ts,
    sourceService: String(sourceService || "unknown"),
    correlationId: mapped.correlationId,
    ledgerType: type,
    metadata: mapped.journalMetadata,
  };
}

/**
 * @param {object} params
 * @param {import("mongoose").ClientSession} [params.session]
 * @returns {Promise<{ inserted: boolean, duplicate?: boolean, doc?: object }>}
 */
export async function appendBillingJournalEvent(params) {
  const {
    eventId,
    userId,
    entityType,
    entityId,
    eventType,
    amount,
    timestamp = new Date(),
    sourceService,
    correlationId,
    ledgerType = null,
    metadata = {},
    session = null,
  } = params;

  if (!eventId || !userId) {
    return { inserted: false };
  }

  try {
    const doc = await BillingEventJournal.create(
      [
        {
          eventId: String(eventId).slice(0, 200),
          userId,
          entityType,
          entityId: normalizeObjectId(entityId),
          eventType,
          amount: Number(amount) || 0,
          timestamp,
          sourceService: String(sourceService || "unknown"),
          correlationId: normalizeObjectId(correlationId),
          ledgerType,
          metadata: metadata && typeof metadata === "object" ? metadata : {},
        },
      ],
      session ? { session } : {}
    );
    return { inserted: true, doc: doc[0] };
  } catch (err) {
    if (err && err.code === 11000) {
      return { inserted: false, duplicate: true };
    }
    throw err;
  }
}

/**
 * Mirror a persisted CreditLedger row into the journal (idempotent). Used after successful post and on duplicate hits.
 * @param {object} ledger - lean or doc with idempotencyKey, user, amount, type, metadata, callId, smsId, createdAt
 * @param {string} sourceService
 * @param {number} [reservedCreditsInc] - only for aligning reserve metadata when absent on ledger
 * @param {import("mongoose").ClientSession|null} [session]
 */
export async function appendJournalFromCreditLedger(ledger, sourceService, reservedCreditsInc = 0, session = null) {
  if (!ledger?.idempotencyKey || !ledger.user) {
    return { inserted: false };
  }
  const payload = buildJournalEntryFromApplyContext({
    userId: ledger.user,
    idempotencyKey: ledger.idempotencyKey,
    type: ledger.type,
    amount: ledger.amount,
    sourceService,
    callId: ledger.callId,
    smsId: ledger.smsId,
    metadata: ledger.metadata || {},
    reservedCreditsInc,
    ledger,
  });
  return appendBillingJournalEvent({ ...payload, session });
}
