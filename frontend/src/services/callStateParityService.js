import API from '../api';

let lastAcceptedSequence = 0;
let lastAcceptedVersionKey = '';

/**
 * @param {object} incoming
 * @param {number|null} incoming.sequence
 * @param {string|null} incoming.callStateVersion
 */
export function shouldAcceptAuthoritativePayload(incoming) {
  const seq = Number(incoming?.sequence ?? 0);
  if (Number.isFinite(seq) && seq > 0 && seq < lastAcceptedSequence) {
    return { accept: false, reason: 'stale_sequence' };
  }
  return { accept: true };
}

export function markAuthoritativeAccepted(incoming) {
  const seq = Number(incoming?.sequence ?? 0);
  if (Number.isFinite(seq) && seq > 0) {
    lastAcceptedSequence = Math.max(lastAcceptedSequence, seq);
  }
  const vk = String(incoming?.callStateVersion || '');
  if (vk) lastAcceptedVersionKey = vk;
}

export function logParity(phase, details = {}) {
  console.log('[CALL PARITY]', { phase, ...details, t: new Date().toISOString() });
}

/**
 * @param {string} callId
 */
export async function fetchCanonicalCallSnapshot(callId) {
  if (!callId) return null;
  try {
    const res = await API.get(`/api/calls/${encodeURIComponent(callId)}`);
    if (res.error) {
      logParity('fetch_failed', { callId, error: res.error });
      return null;
    }
    return res.data?.call ?? res.data ?? null;
  } catch (e) {
    logParity('fetch_exception', { callId, error: e?.message || String(e) });
    return null;
  }
}
