/**
 * Strict inbound ownership resolution.
 *
 * SECURITY-CRITICAL: This module is the single source of truth that decides
 * which user owns an inbound called-party number. Cross-tenant call leakage
 * (User A's PSTN number being delivered to User B) MUST be impossible from
 * here downward. The rules are intentionally rigid:
 *
 *   1. The called party is normalized to a canonical E.164 form.
 *   2. The PhoneNumber collection is searched with an explicit `$in` list
 *      that includes both the canonical form and the raw form, but the result
 *      MUST resolve to exactly one active PhoneNumber row.
 *   3. Zero matches      → REJECT (no fallback ownership).
 *   4. Multiple matches  → REJECT + CRITICAL alert (ambiguity is impossible
 *      under normal data invariants and indicates corrupted ownership state).
 *   5. The result includes a fingerprint that callers feed into
 *      IsolationSecurityAlert so duplicates collapse into one row.
 *
 * No fallback paths (first-active-user, recent socket, last call, etc.) are
 * permitted in this module — by design.
 */

import PhoneNumber from "../models/PhoneNumber.js";
import IsolationSecurityAlert from "../models/IsolationSecurityAlert.js";

/**
 * Strict E.164 normalization for ownership lookups.
 * Loose-match shapes (raw user input, 10-digit local) are not accepted here.
 * Returns `null` when the input cannot be coerced to a verifiable E.164 form.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeInboundNumberStrict(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s+/g, "");
  if (compact.toLowerCase().startsWith("sip:")) return compact;

  let candidate = compact;
  if (candidate.startsWith("00")) {
    candidate = `+${candidate.slice(2)}`;
  }
  if (!candidate.startsWith("+")) {
    const digits = candidate.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length === 10) {
      candidate = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      candidate = `+${digits}`;
    } else if (digits.length >= 8) {
      candidate = `+${digits}`;
    } else {
      return null;
    }
  }

  const digitsOnly = candidate.slice(1).replace(/\D/g, "");
  if (!digitsOnly) return null;
  const canonical = `+${digitsOnly}`;
  if (!/^\+[1-9]\d{7,14}$/.test(canonical)) return null;
  if (canonical.startsWith("+1") && canonical.length !== 12) {
    return null;
  }
  return canonical;
}

/**
 * Stable fingerprint for IsolationSecurityAlert dedup.
 */
function ownershipFingerprint(event, calledNumber, callControlId) {
  const safeCalled = String(calledNumber || "").replace(/[^\d+]/g, "");
  const safeCcid = String(callControlId || "no_ccid").slice(0, 64);
  return `inbound-routing:${event}:${safeCalled || "unknown"}:${safeCcid}`;
}

async function recordOwnershipAlert({
  severity,
  event,
  fingerprint,
  evidence,
  quarantineStatus = "open",
}) {
  try {
    const now = new Date();
    await IsolationSecurityAlert.findOneAndUpdate(
      { fingerprint },
      {
        $setOnInsert: {
          severity,
          event,
          quarantineStatus,
          firstSeenAt: now,
          "evidence.first": evidence,
        },
        $set: {
          lastSeenAt: now,
          "evidence.latest": evidence,
        },
        $inc: { occurrences: 1 },
      },
      { upsert: true }
    );
  } catch (err) {
    // Never throw from the security telemetry path — the goal is to NEVER let
    // the inbound rejection swallow a real call due to alerting infrastructure.
    console.error("[TENANT SECURITY] failed to persist isolation alert", {
      severity,
      event,
      fingerprint,
      error: err?.message || String(err),
    });
  }
}

function logTenantSecurity(level, fields) {
  const tag = level === "critical" ? "[TENANT SECURITY CRITICAL]" : "[TENANT SECURITY]";
  console.warn(tag, {
    sourcePath: "inboundOwnership.js",
    timestamp: new Date().toISOString(),
    ...fields,
  });
}

/**
 * Resolve the unique owner of an inbound called-party number.
 *
 * @param {object} args
 * @param {string|null|undefined} args.rawCalledNumber       Raw `to` from Telnyx payload.
 * @param {string|null|undefined} [args.callControlId]       For alert correlation.
 * @param {string|null|undefined} [args.telnyxEventId]       For alert correlation.
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: "missing_called_number"|"unnormalizable_number"|"no_match"|"ambiguous_match",
 *   ownedNumber?: { _id: any, userId: any, phoneNumber: string },
 *   resolvedUserId?: string,
 *   canonical?: string|null,
 *   matchCount?: number,
 *   matches?: Array<{ _id: string, userId: string, phoneNumber: string }>,
 * }>}
 */
export async function resolveInboundOwner({
  rawCalledNumber,
  callControlId = null,
  telnyxEventId = null,
} = {}) {
  if (rawCalledNumber == null || String(rawCalledNumber).trim() === "") {
    logTenantSecurity("critical", {
      event: "inbound_missing_called_number",
      callControlId,
      telnyxEventId,
    });
    await recordOwnershipAlert({
      severity: "critical",
      event: "inbound_missing_called_number",
      fingerprint: ownershipFingerprint(
        "missing_called_number",
        "unknown",
        callControlId
      ),
      evidence: {
        rawCalledNumber: rawCalledNumber ?? null,
        callControlId,
        telnyxEventId,
      },
      quarantineStatus: "quarantined",
    });
    return { ok: false, reason: "missing_called_number" };
  }

  const canonical = normalizeInboundNumberStrict(rawCalledNumber);
  const raw = String(rawCalledNumber).trim();
  const lookupSet = new Set();
  if (canonical) lookupSet.add(canonical);
  if (raw && raw !== canonical) lookupSet.add(raw);

  if (!canonical && lookupSet.size === 0) {
    logTenantSecurity("critical", {
      event: "inbound_unnormalizable_called_number",
      rawCalledNumber,
      callControlId,
      telnyxEventId,
    });
    await recordOwnershipAlert({
      severity: "critical",
      event: "inbound_unnormalizable_called_number",
      fingerprint: ownershipFingerprint(
        "unnormalizable_number",
        rawCalledNumber,
        callControlId
      ),
      evidence: {
        rawCalledNumber,
        callControlId,
        telnyxEventId,
      },
      quarantineStatus: "quarantined",
    });
    return { ok: false, reason: "unnormalizable_number", canonical: null };
  }

  // Limit 2 because we only ever need to know "exactly one or not".
  const matches = await PhoneNumber.find({
    phoneNumber: { $in: Array.from(lookupSet) },
    status: "active",
  })
    .select("_id userId phoneNumber")
    .limit(2)
    .lean();

  const matchSummary = matches.map((m) => ({
    _id: String(m._id),
    userId: String(m.userId),
    phoneNumber: m.phoneNumber,
  }));

  if (matches.length === 0) {
    logTenantSecurity("warning", {
      event: "inbound_no_owner_match",
      rawCalledNumber: raw,
      canonical,
      callControlId,
      telnyxEventId,
    });
    await recordOwnershipAlert({
      severity: "warning",
      event: "inbound_no_owner_match",
      fingerprint: ownershipFingerprint(
        "no_match",
        canonical || raw,
        callControlId
      ),
      evidence: {
        rawCalledNumber: raw,
        canonical,
        callControlId,
        telnyxEventId,
      },
    });
    return { ok: false, reason: "no_match", canonical, matchCount: 0, matches: [] };
  }

  if (matches.length > 1) {
    logTenantSecurity("critical", {
      event: "inbound_ambiguous_owner_match",
      rawCalledNumber: raw,
      canonical,
      callControlId,
      telnyxEventId,
      matches: matchSummary,
    });
    await recordOwnershipAlert({
      severity: "critical",
      event: "inbound_ambiguous_owner_match",
      fingerprint: ownershipFingerprint(
        "ambiguous_match",
        canonical || raw,
        callControlId
      ),
      evidence: {
        rawCalledNumber: raw,
        canonical,
        callControlId,
        telnyxEventId,
        matches: matchSummary,
      },
      quarantineStatus: "quarantined",
    });
    return {
      ok: false,
      reason: "ambiguous_match",
      canonical,
      matchCount: matches.length,
      matches: matchSummary,
    };
  }

  const owned = matches[0];
  return {
    ok: true,
    ownedNumber: owned,
    resolvedUserId: String(owned.userId),
    canonical,
    matchCount: 1,
    matches: matchSummary,
  };
}

/**
 * Build a normalized lookup set for the active phone numbers owned by `userId`.
 * Used by the client-side ownership pre-check via /api/webrtc/token.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {Promise<Array<{ _id: string, phoneNumber: string, canonical: string|null }>>}
 */
export async function listOwnedNumbersForUser(userId) {
  if (!userId) return [];
  const rows = await PhoneNumber.find({ userId, status: "active" })
    .select("_id phoneNumber")
    .lean();
  return rows.map((row) => ({
    _id: String(row._id),
    phoneNumber: row.phoneNumber,
    canonical: normalizeInboundNumberStrict(row.phoneNumber),
  }));
}

/**
 * Authoritatively verify that `calledNumber` is owned by `userId`.
 * Returns `false` when the number is ambiguous or maps to a different tenant.
 *
 * @param {object} args
 * @param {string|import('mongoose').Types.ObjectId} args.userId
 * @param {string|null|undefined} args.calledNumber
 * @returns {Promise<{ ok: boolean, reason?: string, canonical?: string|null, ownerUserId?: string|null }>}
 */
export async function verifyCalledNumberBelongsToUser({ userId, calledNumber } = {}) {
  if (!userId) return { ok: false, reason: "missing_user" };
  if (calledNumber == null || String(calledNumber).trim() === "") {
    return { ok: false, reason: "missing_called_number" };
  }

  const resolution = await resolveInboundOwner({
    rawCalledNumber: calledNumber,
    callControlId: null,
    telnyxEventId: null,
  });

  if (!resolution.ok) {
    return {
      ok: false,
      reason: resolution.reason,
      canonical: resolution.canonical || null,
      ownerUserId: null,
    };
  }

  if (String(resolution.resolvedUserId) !== String(userId)) {
    logTenantSecurity("critical", {
      event: "inbound_called_number_belongs_to_other_tenant",
      requestingUserId: String(userId),
      ownerUserId: resolution.resolvedUserId,
      canonical: resolution.canonical,
    });
    await recordOwnershipAlert({
      severity: "critical",
      event: "inbound_called_number_belongs_to_other_tenant",
      fingerprint: `inbound-routing:other_tenant:${resolution.canonical || calledNumber}:${userId}`,
      evidence: {
        requestingUserId: String(userId),
        ownerUserId: resolution.resolvedUserId,
        canonical: resolution.canonical,
      },
      quarantineStatus: "quarantined",
    });
    return {
      ok: false,
      reason: "wrong_tenant",
      canonical: resolution.canonical,
      ownerUserId: resolution.resolvedUserId,
    };
  }

  return {
    ok: true,
    canonical: resolution.canonical,
    ownerUserId: resolution.resolvedUserId,
  };
}
