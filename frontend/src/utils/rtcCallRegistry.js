/**
 * Canonical outbound WebRTC call session registry.
 * Maps Telnyx RTC legs to one logical dial (local + Mongo + provider IDs).
 */

const RECONCILE_DELAYS_MS = [50, 200, 500, 1200];
const PENDING_MAX_AGE_MS = 15_000;

/** @typedef {{
 *   localCallId: string,
 *   mongoCallId: string|null,
 *   telnyxCallControlId: string|null,
 *   telnyxSessionId: string|null,
 *   telnyxLegId: string|null,
 *   rtcCallIds: Set<string>,
 *   createdAt: number,
 *   traceId: string|null,
 *   destination: string|null,
 *   caller: string|null,
 *   terminal: boolean,
 * }} RtcSessionEntry */

/** @type {Map<string, RtcSessionEntry>} */
const sessionsByLocal = new Map();
/** @type {Map<string, string>} localCallId */
const byRtc = new Map();
const bySession = new Map();
const byLeg = new Map();
const byControl = new Map();
const byMongo = new Map();

/** @type {string|null} */
let activeLocalCallId = null;

/** @type {{ at: number, eventType: string, hints: object, run: () => void }[]} */
const pendingEvents = [];
const pendingTimers = new Set();

function newLocalCallId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @param {import('@telnyx/webrtc').Call|object|null|undefined} call
 */
export function extractTelnyxIds(call) {
  if (!call) {
    return {
      rtcCallId: null,
      telnyxCallControlId: null,
      telnyxSessionId: null,
      telnyxLegId: null,
    };
  }
  let telnyxCallControlId = null;
  let telnyxSessionId = null;
  let telnyxLegId = null;
  try {
    const ids = typeof call.telnyxIDs === 'object' ? call.telnyxIDs : null;
    if (ids) {
      telnyxCallControlId = ids.telnyxCallControlId || null;
      telnyxSessionId = ids.telnyxSessionId || null;
      telnyxLegId = ids.telnyxLegId || null;
    }
  } catch (_) {
    /* ignore */
  }
  telnyxCallControlId =
    telnyxCallControlId ||
    call.callControlId ||
    call.options?.callControlId ||
    null;
  return {
    rtcCallId: call.id != null ? String(call.id) : null,
    telnyxCallControlId: telnyxCallControlId ? String(telnyxCallControlId) : null,
    telnyxSessionId: telnyxSessionId ? String(telnyxSessionId) : null,
    telnyxLegId: telnyxLegId ? String(telnyxLegId) : null,
  };
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} fields
 */
export function rtcLog(tag, fields = {}) {
  try {
    console.log(tag, {
      t: new Date().toISOString(),
      ...fields,
    });
  } catch {
    console.log(tag, fields);
  }
}

function indexEntry(entry) {
  if (!entry?.localCallId) return;
  const lid = entry.localCallId;
  if (entry.mongoCallId) byMongo.set(String(entry.mongoCallId), lid);
  if (entry.telnyxSessionId) bySession.set(String(entry.telnyxSessionId), lid);
  if (entry.telnyxLegId) byLeg.set(String(entry.telnyxLegId), lid);
  if (entry.telnyxCallControlId) byControl.set(String(entry.telnyxCallControlId), lid);
  for (const rid of entry.rtcCallIds) {
    if (rid) byRtc.set(String(rid), lid);
  }
}

function unindexEntry(entry) {
  if (!entry) return;
  if (entry.mongoCallId && byMongo.get(String(entry.mongoCallId)) === entry.localCallId) {
    byMongo.delete(String(entry.mongoCallId));
  }
  if (entry.telnyxSessionId && bySession.get(String(entry.telnyxSessionId)) === entry.localCallId) {
    bySession.delete(String(entry.telnyxSessionId));
  }
  if (entry.telnyxLegId && byLeg.get(String(entry.telnyxLegId)) === entry.localCallId) {
    byLeg.delete(String(entry.telnyxLegId));
  }
  if (
    entry.telnyxCallControlId &&
    byControl.get(String(entry.telnyxCallControlId)) === entry.localCallId
  ) {
    byControl.delete(String(entry.telnyxCallControlId));
  }
  for (const rid of entry.rtcCallIds) {
    if (rid && byRtc.get(String(rid)) === entry.localCallId) byRtc.delete(String(rid));
  }
}

/**
 * @param {object} hints
 * @returns {{ entry: RtcSessionEntry|null, matchKey: string|null }}
 */
export function resolveActiveCall(hints = {}) {
  const order = [
    ['rtcCallId', hints.rtcCallId],
    ['telnyxSessionId', hints.telnyxSessionId],
    ['telnyxLegId', hints.telnyxLegId],
    ['telnyxCallControlId', hints.telnyxCallControlId],
    ['mongoCallId', hints.mongoCallId],
    ['localCallId', hints.localCallId],
  ];
  for (const [key, raw] of order) {
    if (raw == null || raw === '') continue;
    const v = String(raw);
    let lid = null;
    if (key === 'rtcCallId') lid = byRtc.get(v);
    else if (key === 'telnyxSessionId') lid = bySession.get(v);
    else if (key === 'telnyxLegId') lid = byLeg.get(v);
    else if (key === 'telnyxCallControlId') lid = byControl.get(v);
    else if (key === 'mongoCallId') lid = byMongo.get(v);
    else if (key === 'localCallId') lid = v;
    if (lid) {
      const entry = sessionsByLocal.get(lid);
      if (entry && !entry.terminal) {
        return { entry, matchKey: key };
      }
    }
  }
  if (activeLocalCallId) {
    const entry = sessionsByLocal.get(activeLocalCallId);
    if (entry && !entry.terminal) return { entry, matchKey: 'activeLocalCallId' };
  }
  return { entry: null, matchKey: null };
}

/**
 * @param {{ traceId?: string, destination?: string, caller?: string }} opts
 */
export function createOutboundSession(opts = {}) {
  const localCallId = newLocalCallId();
  /** @type {RtcSessionEntry} */
  const entry = {
    localCallId,
    mongoCallId: null,
    telnyxCallControlId: null,
    telnyxSessionId: null,
    telnyxLegId: null,
    rtcCallIds: new Set(),
    createdAt: Date.now(),
    traceId: opts.traceId || null,
    destination: opts.destination || null,
    caller: opts.caller || null,
    terminal: false,
  };
  sessionsByLocal.set(localCallId, entry);
  activeLocalCallId = localCallId;
  rtcLog('[RTC OUTBOUND CREATE]', snapshotEntry(entry));
  return entry;
}

/**
 * @param {string} localCallId
 * @param {object} call Telnyx Call
 */
export function registerRtcLeg(localCallId, call) {
  const entry = sessionsByLocal.get(localCallId);
  if (!entry || entry.terminal) {
    rtcLog('[RTC CALL ERROR]', {
      reason: 'register_rtc_leg_no_session',
      localCallId,
      rtcCallId: call?.id ?? null,
    });
    return null;
  }
  const ids = extractTelnyxIds(call);
  if (ids.rtcCallId) entry.rtcCallIds.add(ids.rtcCallId);
  if (ids.telnyxCallControlId) entry.telnyxCallControlId = ids.telnyxCallControlId;
  if (ids.telnyxSessionId) entry.telnyxSessionId = ids.telnyxSessionId;
  if (ids.telnyxLegId) entry.telnyxLegId = ids.telnyxLegId;
  indexEntry(entry);
  if (call) {
    call._localCallId = localCallId;
    if (entry.mongoCallId) call._dbCallId = entry.mongoCallId;
  }
  activeLocalCallId = localCallId;
  rtcLog('[RTC CALL REGISTER]', {
    ...snapshotEntry(entry),
    rtcCallId: ids.rtcCallId,
    legDirection: call?.direction ?? null,
  });
  flushPendingEvents();
  return entry;
}

/**
 * @param {string} localCallId
 * @param {string} mongoCallId
 */
export function reconcileMongoCallId(localCallId, mongoCallId) {
  const entry = sessionsByLocal.get(localCallId);
  if (!entry || !mongoCallId) return null;
  entry.mongoCallId = String(mongoCallId);
  indexEntry(entry);
  rtcLog('[RTC CALL RECONCILE]', {
    ...snapshotEntry(entry),
    field: 'mongoCallId',
  });
  flushPendingEvents();
  return entry;
}

/**
 * @param {object} call
 * @param {string|null} [preferredLocalCallId]
 */
export function syncCallFromLeg(call, preferredLocalCallId = null) {
  if (!call) return { entry: null, matchKey: null };
  const ids = extractTelnyxIds(call);
  let localCallId = preferredLocalCallId || call._localCallId || null;
  let resolved = resolveActiveCall({ ...ids, localCallId });
  if (!resolved.entry && activeLocalCallId) {
    resolved = resolveActiveCall({ localCallId: activeLocalCallId, ...ids });
  }
  if (!resolved.entry) {
    rtcLog('[RTC EVENT]', {
      ...ids,
      mongoCallId: null,
      localCallId: localCallId || null,
      note: 'no_registry_match_yet',
      sdkState: call.state ?? null,
    });
    return { entry: null, matchKey: null, ids };
  }
  const entry = resolved.entry;
  if (ids.rtcCallId) entry.rtcCallIds.add(ids.rtcCallId);
  if (ids.telnyxCallControlId) entry.telnyxCallControlId = ids.telnyxCallControlId;
  if (ids.telnyxSessionId) entry.telnyxSessionId = ids.telnyxSessionId;
  if (ids.telnyxLegId) entry.telnyxLegId = ids.telnyxLegId;
  indexEntry(entry);
  call._localCallId = entry.localCallId;
  if (entry.mongoCallId) call._dbCallId = entry.mongoCallId;
  rtcLog('[RTC CALL MATCH]', {
    matchKey: resolved.matchKey,
    ...snapshotEntry(entry),
    rtcCallId: ids.rtcCallId,
    sdkState: call.state ?? null,
  });
  return { entry, matchKey: resolved.matchKey, ids };
}

/**
 * @param {string} eventType
 * @param {object} hints
 * @param {() => void} run
 */
export function scheduleRtcReconcile(eventType, hints, run) {
  pendingEvents.push({
    at: Date.now(),
    eventType,
    hints,
    run,
  });
  for (const ms of RECONCILE_DELAYS_MS) {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      flushPendingEvents();
    }, ms);
    pendingTimers.add(id);
  }
}

function flushPendingEvents() {
  const now = Date.now();
  const remaining = [];
  for (const pe of pendingEvents) {
    if (now - pe.at > PENDING_MAX_AGE_MS) continue;
    const { entry } = resolveActiveCall(pe.hints);
    if (entry) {
      try {
        rtcLog('[RTC CALL RECONCILE]', {
          eventType: pe.eventType,
          ...snapshotEntry(entry),
        });
        pe.run(entry);
      } catch (e) {
        rtcLog('[RTC CALL ERROR]', {
          reason: 'pending_reconcile_run_failed',
          message: e?.message || String(e),
        });
      }
    } else {
      remaining.push(pe);
    }
  }
  pendingEvents.length = 0;
  pendingEvents.push(...remaining);
  if (remaining.length) {
    rtcLog('[RTC CALL RECONCILE]', {
      note: 'pending_events_remain',
      count: remaining.length,
    });
  }
}

/**
 * @param {string} localCallId
 */
export function markSessionTerminal(localCallId) {
  const entry = sessionsByLocal.get(localCallId);
  if (!entry) return;
  entry.terminal = true;
  unindexEntry(entry);
  if (activeLocalCallId === localCallId) activeLocalCallId = null;
  rtcLog('[RTC CALL REMOVE]', snapshotEntry(entry));
  window.setTimeout(() => {
    sessionsByLocal.delete(localCallId);
  }, 60_000);
}

export function getActiveLocalCallId() {
  return activeLocalCallId;
}

export function getSession(localCallId) {
  return sessionsByLocal.get(localCallId) || null;
}

/** @param {RtcSessionEntry} entry */
export function snapshotEntry(entry) {
  if (!entry) {
    return {
      localCallId: null,
      mongoCallId: null,
      telnyxCallControlId: null,
      telnyxSessionId: null,
      telnyxLegId: null,
      rtcCallId: null,
      rtcCallIds: [],
    };
  }
  const rtcIds = [...entry.rtcCallIds];
  return {
    localCallId: entry.localCallId,
    mongoCallId: entry.mongoCallId,
    telnyxCallControlId: entry.telnyxCallControlId,
    telnyxSessionId: entry.telnyxSessionId,
    telnyxLegId: entry.telnyxLegId,
    rtcCallId: rtcIds[rtcIds.length - 1] || null,
    rtcCallIds: rtcIds,
    traceId: entry.traceId,
  };
}

/**
 * Find live SDK Call object when event references an id not on the stale object ref.
 * @param {object} client
 * @param {object} hints
 */
export function resolveSdkCallFromClientMap(client, hints) {
  if (!client?.calls) return null;
  const rtcId = hints?.rtcCallId != null ? String(hints.rtcCallId) : null;
  if (rtcId && client.calls[rtcId]) return client.calls[rtcId];
  for (const leg of Object.values(client.calls)) {
    if (!leg) continue;
    const ids = extractTelnyxIds(leg);
    if (rtcId && ids.rtcCallId === rtcId) return leg;
    if (
      hints.telnyxSessionId &&
      ids.telnyxSessionId &&
      ids.telnyxSessionId === String(hints.telnyxSessionId)
    ) {
      return leg;
    }
    if (hints.telnyxLegId && ids.telnyxLegId && ids.telnyxLegId === String(hints.telnyxLegId)) {
      return leg;
    }
    if (
      hints.telnyxCallControlId &&
      ids.telnyxCallControlId &&
      ids.telnyxCallControlId === String(hints.telnyxCallControlId)
    ) {
      return leg;
    }
  }
  return null;
}

export function resetRegistryForTests() {
  sessionsByLocal.clear();
  byRtc.clear();
  bySession.clear();
  byLeg.clear();
  byControl.clear();
  byMongo.clear();
  pendingEvents.length = 0;
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.clear();
  activeLocalCallId = null;
}
