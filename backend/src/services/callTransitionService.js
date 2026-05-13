import Call from "../models/Call.js";
import CallLifecycleEvent from "../models/CallLifecycleEvent.js";
import { withCallWriteLock } from "./callWriteLockService.js";
import { acceptEventForCall, eventOrderingPatch } from "../utils/callEventOrdering.js";
import {
  canTransitionTo,
  isTerminalStatus,
  normalizeCallStatus,
} from "../utils/callStateMachine.js";

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

function normalizeApplyResult(result) {
  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.reason || "apply_failed",
      call: result?.call || null,
    };
  }
  return {
    ok: true,
    call: result?.call || null,
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
  const locked = await withCallWriteLock(callId, async () => {
    const call = await Call.findById(callId);
    if (!call) {
      return { ok: false, reason: "not_found" };
    }

    const from = normalizeCallStatus(call.status);
    const to = targetStatus == null ? null : normalizeCallStatus(targetStatus);
    const order = await acceptEventForCall({
      call,
      eventAt: eventAt || new Date(),
      source,
      eventType,
      callControlId: call.telnyxCallControlId || null,
      callSessionId: call.telnyxCallSessionId || null,
    });
    if (!order.accepted) {
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

    return { ok: true, call };
  });
  return normalizeApplyResult(locked);
}
