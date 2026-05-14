/**
 * Client-side defense against shared-SIP-credential tenant leakage.
 *
 * Because all browsers in this deployment register with the same SIP
 * username/password (TELNYX_SIP_USERNAME / TELNYX_SIP_PASSWORD), Telnyx will
 * fork an inbound PSTN INVITE to every WebRTC client that is currently
 * registered — including clients owned by other tenants. The browser MUST
 * therefore independently verify that the called-party number (destination)
 * on every inbound INVITE belongs to the authenticated user, and MUST
 * REJECT the call when it does not.
 */

import API from "../api";
import { telecomStructuredLog } from "./telecomStructuredLog.js";

/**
 * Strict E.164 normalization mirroring `backend/src/utils/inboundOwnership.js`.
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
 * Extract the called-party (destination) number from a Telnyx WebRTC call.
 * The SDK exposes the called number on incoming calls as
 * `call.options.destinationNumber` (sourced from `callee_id_number`).
 *
 * @param {object|null|undefined} call
 * @returns {string|null}
 */
export function extractCalledNumberFromIncomingCall(call) {
  if (!call) return null;
  const opts = call.options || {};
  const candidates = [
    opts.destinationNumber,
    opts.calleeIdNumber,
    opts.callee_id_number,
    opts.callerNumber, // For inbound calls Telnyx SDK populates this with the callee id too.
    call.destinationNumber,
    call.calleeIdNumber,
    call.callee_id_number,
    call.to,
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const str = String(value).trim();
    if (!str) continue;
    if (str.toLowerCase() === "unknown" || str.toLowerCase() === "anonymous") {
      continue;
    }
    return str;
  }
  return null;
}

/**
 * Synchronous local check against the ownedNumbers list returned from
 * /api/webrtc/token. This is the fast-path that runs BEFORE we present the
 * incoming-call UI. The backend `/api/webrtc/verify-inbound-ownership` is
 * still used as the authoritative check (defense in depth, in case the local
 * list is stale).
 *
 * @param {string|null|undefined} calledNumber
 * @param {Array<{ phoneNumber?: string|null, canonical?: string|null }>|null|undefined} ownedNumbers
 * @returns {{ ok: boolean, reason?: string, canonical: string|null }}
 */
export function checkCalledNumberAgainstOwnedList(calledNumber, ownedNumbers) {
  if (calledNumber == null || String(calledNumber).trim() === "") {
    return { ok: false, reason: "missing_called_number", canonical: null };
  }
  const canonical = normalizeInboundNumberStrict(calledNumber);
  if (!Array.isArray(ownedNumbers) || ownedNumbers.length === 0) {
    return { ok: false, reason: "no_owned_numbers", canonical };
  }
  const ownedCanonicals = new Set();
  const ownedRaw = new Set();
  for (const entry of ownedNumbers) {
    if (!entry) continue;
    const raw = entry.phoneNumber ? String(entry.phoneNumber).trim() : "";
    if (raw) ownedRaw.add(raw);
    const c =
      entry.canonical && String(entry.canonical).trim()
        ? String(entry.canonical).trim()
        : normalizeInboundNumberStrict(raw);
    if (c) ownedCanonicals.add(c);
  }
  if (canonical && ownedCanonicals.has(canonical)) {
    return { ok: true, canonical };
  }
  const rawCalled = String(calledNumber).trim();
  if (ownedRaw.has(rawCalled)) {
    return { ok: true, canonical };
  }
  return { ok: false, reason: "not_in_owned_list", canonical };
}

/**
 * Authoritative server-side verification. Returns `{ ok: true }` ONLY when the
 * called number is provably owned by the authenticated user. Any error or
 * unexpected response is treated as "not owned" (fail-closed).
 *
 * @param {object} args
 * @param {string} args.calledNumber
 * @param {string|null} [args.callerNumber]
 * @param {string|null} [args.callControlId]
 * @returns {Promise<{ ok: boolean, reason?: string, canonical?: string|null }>}
 */
export async function verifyInboundOwnershipServer({
  calledNumber,
  callerNumber = null,
  callControlId = null,
} = {}) {
  try {
    const response = await API.post("/api/webrtc/verify-inbound-ownership", {
      calledNumber,
      callerNumber,
      callControlId,
    });
    if (response?.error) {
      return { ok: false, reason: "verification_request_failed" };
    }
    const data = response?.data;
    if (data && data.ok === true && data.ownsNumber === true) {
      return { ok: true, canonical: data.canonical || null };
    }
    return {
      ok: false,
      reason: data?.reason || "not_owned",
      canonical: data?.canonical || null,
    };
  } catch (err) {
    return { ok: false, reason: "verification_exception" };
  }
}

/**
 * Best-effort SIP-level rejection of an incoming call that we know belongs to
 * another tenant. Telnyx WebRTC SDK exposes `hangup()` on the Call object and,
 * for incoming calls, will send a SIP BYE/CANCEL — preventing the user-visible
 * "ring" event from ever firing. Multiple SDK builds use slightly different
 * shapes, so we attempt several safe accessors and swallow errors.
 *
 * @param {object} call
 * @param {string} reason
 */
export function rejectIncomingCallSafely(call, reason) {
  if (!call) return;
  try {
    if (typeof call.hangup === "function") {
      try {
        call.hangup({ cause: "USER_BUSY", causeCode: 17 });
      } catch (_) {
        try {
          call.hangup();
        } catch (_) {
          /* swallow */
        }
      }
      return;
    }
  } catch (_) {
    /* swallow */
  }
  try {
    if (typeof call.reject === "function") {
      call.reject();
    }
  } catch (_) {
    /* swallow */
  }
  // No-op fallthrough — even with no SDK method, returning here without
  // surfacing UI is sufficient to prevent the leak.
  telecomStructuredLog("[TENANT SECURITY CRITICAL]", {
    sourcePath: "inboundOwnership.js:rejectIncomingCallSafely",
    eventType: "inbound_rejected_no_sdk_hangup",
    rejectionReason: reason || "unknown",
  });
}

export function logTenantSecurityClient(level, fields) {
  const tag =
    level === "critical" ? "[TENANT SECURITY CRITICAL]" : "[TENANT SECURITY]";
  telecomStructuredLog(tag, {
    sourcePath: "CallContext.jsx:inboundOwnership",
    ...fields,
  });
}
