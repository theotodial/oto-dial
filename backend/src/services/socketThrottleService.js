/**
 * Socket.IO emit throttling for call:authoritative_state — preserves terminal,
 * inbound ring-path, and billing-impact class events.
 */

import { isTerminalStatus, normalizeCallStatus } from "../utils/callStateMachine.js";
import { recordSocketEmit } from "./telecomBackpressureService.js";
import { recordUserTelecomSignal, recordUserThrottleEvent } from "./hotUserIsolationService.js";

let throttledEmits = 0;
let collapsedEmits = 0;

const PER_USER_WINDOW_MS = 1000;
const PER_USER_MAX_EMITS = Number(process.env.SOCKET_THROTTLE_MAX_PER_USER_PER_SEC || 24);

/** @type {Map<string, { windowStart: number, count: number }>} */
const userBuckets = new Map();

/** @type {Map<string, { fingerprint: string, at: number }>} */
const lastAuthoritative = new Map();

function bucketKey(userId) {
  return String(userId || "");
}

function fingerprintFromPayload(payload) {
  const snap = payload?.snapshot || {};
  const dir = snap.direction || payload.direction || "";
  return [
    payload?.callId,
    payload?.callStateVersion,
    payload?.economicVersion,
    normalizeCallStatus(payload?.callStatus),
    String(dir),
  ].join("|");
}

function isInboundRingPath(payload) {
  const snap = payload?.snapshot || {};
  const dir = String(snap.direction || payload.direction || "").toLowerCase();
  if (dir !== "inbound") return false;
  const st = normalizeCallStatus(payload?.callStatus);
  return ["queued", "initiated", "dialing", "ringing"].includes(st);
}

function hasBillingImpactSignal(payload) {
  if (payload?.billingImpact === true) return true;
  const snap = payload?.snapshot || {};
  if (snap.creditReservationHeld != null && Number(snap.creditReservationHeld) > 0) return true;
  if (snap.durationCreditsCharged != null && Number(snap.durationCreditsCharged) > 0) return true;
  return false;
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {object} payload
 * @returns {{ allow: boolean, reason?: string }}
 */
export function evaluateCallAuthoritativeEmit(userId, payload) {
  const uid = bucketKey(userId);
  if (!uid || !payload) return { allow: true };

  const status = normalizeCallStatus(payload.callStatus);
  if (isTerminalStatus(status)) {
    return { allow: true, reason: "terminal" };
  }
  if (isInboundRingPath(payload)) {
    return { allow: true, reason: "inbound_ring" };
  }
  if (hasBillingImpactSignal(payload)) {
    return { allow: true, reason: "billing_signal" };
  }

  const now = Date.now();
  const b = userBuckets.get(uid) || { windowStart: now, count: 0 };
  if (now - b.windowStart > PER_USER_WINDOW_MS) {
    b.windowStart = now;
    b.count = 0;
  }
  b.count += 1;
  userBuckets.set(uid, b);
  if (b.count > PER_USER_MAX_EMITS) {
    throttledEmits += 1;
    recordUserTelecomSignal(uid, { emits: 1 });
    recordUserThrottleEvent(uid, "socket_emit_rate");
    return { allow: false, reason: "per_user_rate" };
  }

  const fp = fingerprintFromPayload(payload);
  const prev = lastAuthoritative.get(uid);
  if (prev && prev.fingerprint === fp && now - prev.at < 400) {
    collapsedEmits += 1;
    recordUserThrottleEvent(uid, "authoritative_collapse");
    return { allow: false, reason: "duplicate_authoritative" };
  }
  lastAuthoritative.set(uid, { fingerprint: fp, at: now });

  return { allow: true, reason: "throttle_ok" };
}

export function recordAuthoritativeEmitDelivered(userId) {
  recordSocketEmit();
  recordUserTelecomSignal(String(userId || ""), { emits: 1 });
}

export function getSocketThrottleStats() {
  return {
    throttledEmits,
    collapsedEmits,
    perUserWindowMs: PER_USER_WINDOW_MS,
    perUserMax: PER_USER_MAX_EMITS,
  };
}
