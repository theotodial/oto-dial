import Call from "../models/Call.js";
import CallLifecycleEvent from "../models/CallLifecycleEvent.js";
import { withCallWriteLock } from "./callWriteLockService.js";
import { acceptEventForCall, eventOrderingPatch } from "../utils/callEventOrdering.js";
import {
  canTransitionTo,
  isTerminalStatus,
  normalizeCallStatus,
} from "../utils/callStateMachine.js";
import { telecomStructuredLog } from "../utils/telecomStructuredLog.js";
import { recordTelecomEventSequence } from "./telecomSequenceService.js";
import { broadcastAuthoritativeCallState } from "./socketConsistencyService.js";
import { recordCallTransition } from "./telecomBackpressureService.js";

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function logLifecycle({
  callId,
  userId,
  event,
  previousState,
  nextState,
  action,
  severity = "info",
  details = {},
}) {
  await CallLifecycleEvent.create({
    callId,
    userId: userId || null,
    severity,
    event,
    previousState: previousState || null,
    nextState: nextState || null,
    action: action || "observed",
    details,
  }).catch(() => {});
}

function logOutboundDialDebug(fields = {}) {
  telecomStructuredLog("[CALL FLOW]", {
    sourcePath: "callTransitionService.js:applyCallTransition",
    ...fields,
  });
}

function normalizeApplyResult(result) {
  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.reason || "apply_failed",
      call: result?.call || null,
      meta: null,
    };
  }
  return {
    ok: true,
    call: result?.call || null,
    meta: result?.meta || null,
  };
}

export async function applyCallTransition({
  callId,
  eventAt,
  source,
  eventType,
  targetStatus = null,
  guard = {},
  set = {},
  reason = null,
  details = {},
}) {
  const normalizedTargetStatus =
    targetStatus == null ? null : normalizeCallStatus(targetStatus);
  logOutboundDialDebug({
    phase: "transition_enter",
    callId: callId ? String(callId) : null,
    userId: null,
    callControlId: null,
    currentStatus: null,
    targetStatus: normalizedTargetStatus,
    accepted: null,
    rejectionReason: null,
    lockAcquired: null,
    eventTimestamp: eventAt || null,
    eventType: eventType || null,
    transitionSource: source || null,
  });
  const locked = await withCallWriteLock(callId, async () => {
    const call = await Call.findById(callId);
    if (!call) {
      logOutboundDialDebug({
        phase: "not_found",
        callId: callId ? String(callId) : null,
        userId: null,
        callControlId: null,
        currentStatus: null,
        targetStatus: normalizedTargetStatus,
        accepted: false,
        rejectionReason: "not_found",
        lockAcquired: true,
        eventTimestamp: eventAt || null,
        eventType: eventType || null,
        transitionSource: source || null,
      });
      return { ok: false, reason: "not_found" };
    }

    const from = normalizeCallStatus(call.status);
    const to = normalizedTargetStatus;
    const order = await acceptEventForCall({
      call,
      eventAt: eventAt || new Date(),
      source,
      eventType,
      callControlId: call.telnyxCallControlId || null,
      callSessionId: call.telnyxCallSessionId || null,
    });
    if (!order.accepted) {
      logOutboundDialDebug({
        phase: "ordering_rejected",
        callId: String(call._id),
        userId: call.user ? String(call.user) : null,
        callControlId: call.telnyxCallControlId || null,
        currentStatus: from,
        targetStatus: to,
        accepted: false,
        rejectionReason: order.reason,
        lockAcquired: true,
        eventTimestamp: eventAt || null,
        eventType: eventType || null,
        transitionSource: source || null,
      });
      return { ok: false, reason: order.reason, call };
    }

    if (guard.currentStatus && normalizeCallStatus(guard.currentStatus) !== from) {
      await logLifecycle({
        callId: call._id,
        userId: call.user,
        event: "ordering_enforcement_bypass_blocked",
        previousState: from,
        nextState: to || from,
        action: "guard_status_mismatch",
        severity: "warning",
        details: { source, eventType, expected: guard.currentStatus, actual: call.status },
      });
      return { ok: false, reason: "guard_status_mismatch", call };
    }

    if (guard.maxUpdatedAt) {
      const updatedAt = toDate(call.updatedAt);
      const maxUpdatedAt = toDate(guard.maxUpdatedAt);
      if (updatedAt && maxUpdatedAt && updatedAt.getTime() > maxUpdatedAt.getTime()) {
        await logLifecycle({
          callId: call._id,
          userId: call.user,
          event: "ordering_enforcement_bypass_blocked",
          previousState: from,
          nextState: to || from,
          action: "guard_updatedAt_mismatch",
          severity: "warning",
          details: { source, eventType, maxUpdatedAt, actualUpdatedAt: updatedAt },
        });
        return { ok: false, reason: "guard_updatedAt_mismatch", call };
      }
    }

    if (to) {
      if (isTerminalStatus(from)) {
        await logLifecycle({
          callId: call._id,
          userId: call.user,
          event: "invalid_transition",
          previousState: from,
          nextState: to,
          action: "ignored_terminal_call",
          severity: "warning",
          details: { source, eventType, reason: reason || null, ...details },
        });
        return { ok: false, reason: "terminal", call };
      }
      if (!canTransitionTo(from, to)) {
        await logLifecycle({
          callId: call._id,
          userId: call.user,
          event: "invalid_transition",
          previousState: from,
          nextState: to,
          action: "rejected_by_state_machine",
          severity: "warning",
          details: { source, eventType, reason: reason || null, ...details },
        });
        return { ok: false, reason: "invalid_transition", call };
      }
      call.status = to;
    }

    Object.assign(call, set || {});
    Object.assign(
      call,
      eventOrderingPatch({
        eventAt: eventAt || new Date(),
        source,
        eventType,
      })
    );
    call.$locals = call.$locals || {};
    call.$locals.transitionSource = source || "unknown";
    await call.save();

    await logLifecycle({
      callId: call._id,
      userId: call.user,
      event: to ? "state_transition" : "metadata_update",
      previousState: from,
      nextState: to || from,
      action: "applied",
      severity: "info",
      details: { source, eventType, reason: reason || null, ...details },
    });

    logOutboundDialDebug({
      phase: "transition_applied",
      callId: String(call._id),
      userId: call.user ? String(call.user) : null,
      callControlId: call.telnyxCallControlId || null,
      currentStatus: from,
      targetStatus: to,
      accepted: true,
      rejectionReason: null,
      lockAcquired: true,
      eventTimestamp: eventAt || null,
      eventType: eventType || null,
      transitionSource: source || null,
    });

    return { ok: true, call, meta: { from, to } };
  });
  const out = normalizeApplyResult(locked);
  if (!out.ok) {
    logOutboundDialDebug({
      phase: "transition_exit_rejected",
      callId: callId ? String(callId) : null,
      userId: out.call?.user ? String(out.call.user) : null,
      callControlId: out.call?.telnyxCallControlId || null,
      currentStatus: out.call?.status || null,
      targetStatus: normalizedTargetStatus,
      accepted: false,
      rejectionReason: out.reason || null,
      lockAcquired: out.reason === "call_write_lock_skipped" ? false : null,
      eventTimestamp: eventAt || null,
      eventType: eventType || null,
      transitionSource: source || null,
    });
  }
  if (out.ok && out.call?._id) {
    const c = out.call;
    const fromS = out.meta?.from != null ? normalizeCallStatus(out.meta.from) : normalizeCallStatus(c.status);
    const toS = out.meta?.to != null ? normalizeCallStatus(out.meta.to) : normalizeCallStatus(c.status);
    if (out.meta?.to != null && fromS !== toS) {
      recordCallTransition();
    }
    void recordTelecomEventSequence({
      callId: c._id,
      provider: "internal",
      providerEventId: null,
      providerTimestamp: eventAt || new Date(),
      receivedAt: new Date(),
      eventType: eventType || "call_transition",
      source: source || "call_transition_service",
      orderingAccepted: true,
      orderingReason: "transition_applied",
      currentCallStatus: fromS,
      nextCallStatus: toS,
      duplicate: false,
      metadata: { reason: reason || null, details: details || {} },
    }).catch(() => {});
    void broadcastAuthoritativeCallState({
      callId: c._id,
      userId: c.user,
      source: "call_transition",
      eventType: eventType || null,
    }).catch(() => {});
  }
  return out;
}
