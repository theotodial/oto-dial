/**
 * Guards against premature hangup/cleanup during outbound WebRTC setup.
 */

const SETUP_UI_STATES = new Set([
  'dialing',
  'connecting',
  'ringing',
  'incoming',
]);

const PRE_ANSWER_SDK_STATES = new Set([
  'new',
  'requesting',
  'trying',
  'recovering',
  'ringing',
  'early',
  'answering',
  'active',
  'held',
]);

/** User-initiated cleanup reasons — always allowed. */
const USER_CLEANUP_REASONS = new Set([
  'user_hangup',
  'user_reject_incoming',
]);

/** Automatic cleanup allowed even during setup (hard failures only). */
const FORCED_CLEANUP_REASONS = new Set([
  'newCall_returned_null',
  'makeCall_catch_before_leg',
]);

/**
 * @param {object} client TelnyxRTC client
 * @param {(call: object) => boolean} [isTerminal]
 */
export function getLiveSdkLegs(client, isTerminal = () => false) {
  if (!client?.calls) return [];
  return Object.values(client.calls).filter((c) => c && !isTerminal(c));
}

/**
 * @param {object} refs
 * @param {import('react').MutableRefObject<boolean>} refs.outboundDialActiveRef
 * @param {import('react').MutableRefObject<number>} refs.outboundDialStartedAtRef
 * @param {import('react').MutableRefObject<string>} refs.callStateRef
 * @param {import('react').MutableRefObject<object|null>} refs.telnyxClientRef
 * @param {(call: object) => boolean} isTerminal
 */
export function isOutboundSetupProtected(refs, isTerminal) {
  if (!refs.outboundDialActiveRef.current) return false;
  const ui = refs.callStateRef.current;
  if (!SETUP_UI_STATES.has(ui)) return false;
  const legs = getLiveSdkLegs(refs.telnyxClientRef.current, isTerminal);
  if (legs.length > 0) return true;
  const startedAt = Number(refs.outboundDialStartedAtRef.current || 0);
  if (startedAt > 0 && Date.now() - startedAt < 120_000) return true;
  return false;
}

/**
 * @param {string|null|undefined} reason
 * @param {object} refs
 * @param {import('react').MutableRefObject<boolean>} refs.manualHangupRef
 * @param {import('react').MutableRefObject<boolean>} refs.userEndedFullCallRef
 */
export function shouldBlockAutomaticCleanup(reason, refs, isTerminal) {
  if (FORCED_CLEANUP_REASONS.has(reason || '')) return false;
  if (USER_CLEANUP_REASONS.has(reason || '')) return false;
  if (refs.manualHangupRef?.current || refs.userEndedFullCallRef?.current) {
    return false;
  }
  return isOutboundSetupProtected(refs, isTerminal);
}

/**
 * @param {string} reason
 */
export function shouldBlockHangup(reason) {
  if (USER_CLEANUP_REASONS.has(reason)) return false;
  if (FORCED_CLEANUP_REASONS.has(reason)) return false;
  if (
    reason === 'persist_after_newCall_failed' ||
    reason === 'persist_after_newCall_throw'
  ) {
    return true;
  }
  return false;
}

/**
 * @param {object} leg
 * @param {(call: object) => string} normalizeState
 * @param {(call: object) => boolean} hasLiveRemoteAudio
 */
export function isPreAnswerProgressLeg(leg, normalizeState, hasLiveRemoteAudio) {
  if (!leg) return false;
  const s = normalizeState(leg);
  if (PRE_ANSWER_SDK_STATES.has(s)) return true;
  try {
    return hasLiveRemoteAudio(leg);
  } catch {
    return false;
  }
}

/**
 * @param {object} client
 * @param {object} hints
 * @param {(call: object) => object} extractIds
 */
export function resolveSdkCallFromClientMap(client, hints, extractIds) {
  if (!client?.calls) return null;
  const rtcId = hints?.rtcCallId != null ? String(hints.rtcCallId) : null;
  if (rtcId && client.calls[rtcId]) return client.calls[rtcId];
  for (const leg of Object.values(client.calls)) {
    if (!leg) continue;
    const ids = extractIds(leg);
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

export function logCallLifecycle(tag, fields = {}) {
  try {
    console.log(tag, { t: new Date().toISOString(), ...fields });
  } catch {
    console.log(tag, fields);
  }
}
