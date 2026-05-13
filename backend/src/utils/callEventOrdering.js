import CallLifecycleEvent from "../models/CallLifecycleEvent.js";
import { normalizeCallStatus } from "./callStateMachine.js";

function toDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function acceptEventForCall({
  call,
  eventAt,
  source,
  eventType,
  callControlId = null,
  callSessionId = null,
}) {
  const nextAt = toDate(eventAt) || new Date();
  const currentAt = toDate(call?.lastProcessedEventAt);
  if (currentAt && nextAt.getTime() < currentAt.getTime()) {
    await CallLifecycleEvent.create({
      callId: call._id,
      userId: call.user || null,
      severity: "warning",
      event: "stale_event_ignored",
      previousState: normalizeCallStatus(call.status),
      nextState: normalizeCallStatus(call.status),
      action: "ignored",
      details: {
        source,
        eventType: eventType || null,
        callControlId: callControlId || null,
        callSessionId: callSessionId || null,
        incomingEventAt: nextAt,
        lastProcessedEventAt: currentAt,
      },
      timestamp: new Date(),
    }).catch(() => {});
    return { accepted: false, reason: "stale_event_ignored", eventAt: nextAt };
  }
  return { accepted: true, eventAt: nextAt };
}

export function eventOrderingPatch({ eventAt, source, eventType }) {
  const at = toDate(eventAt) || new Date();
  return {
    lastProcessedEventAt: at,
    lastEventSource: source || null,
    lastEventType: eventType || null,
  };
}
