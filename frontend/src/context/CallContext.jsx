import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import API from '../api';
import soundManager from '../utils/sounds';
import { useWakeLock } from '../hooks/useWakeLock';
import { telecomStructuredLog } from '../utils/telecomStructuredLog.js';
import {
  checkCalledNumberAgainstOwnedList,
  extractCalledNumberFromIncomingCall,
  logTenantSecurityClient,
  normalizeInboundNumberStrict,
  rejectIncomingCallSafely,
  verifyInboundOwnershipServer,
} from '../utils/inboundOwnership.js';
import {
  fetchCanonicalCallSnapshot,
  logParity,
  markAuthoritativeAccepted,
  shouldAcceptAuthoritativePayload,
} from '../services/callStateParityService';

const CallContext = createContext(null);

// Call states
export const CALL_STATES = {
  IDLE: 'idle',
  DIALING: 'dialing',
  CONNECTING: 'connecting',
  RINGING: 'ringing',
  ACTIVE: 'active',
  HELD: 'held',
  INCOMING: 'incoming',
  ENDING: 'ending'
};

/** WebRTC token + repair-outbound chain many Telnyx REST calls — must exceed default axios caps. */
const TELECOM_HTTP_TIMEOUT_MS = 120_000;

/** Matches backend CALL_MINIMAL_MODE — skips client-side repair-outbound. Set VITE_CALL_MINIMAL_MODE=true in production .env + rebuild. */
const isCallMinimalClient =
  import.meta.env.VITE_CALL_MINIMAL_MODE === 'true' ||
  import.meta.env.VITE_CALL_MINIMAL_MODE === '1';

function safeHangupTelnyxCall(call) {
  if (!call) return;
  try {
    if (typeof call.hangup === 'function') call.hangup();
  } catch (e) {
    console.warn('[CALL EXECUTION] hangup_failed', e?.message || e);
  }
}

/** Browser-console correlation (pair with backend logs via x-oto-exec-trace). */
function execTrace(traceId, stage, fields = {}) {
  try {
    console.log(
      '[EXEC TRACE]',
      JSON.stringify({
        traceId,
        stage,
        t: new Date().toISOString(),
        ...fields,
      })
    );
  } catch {
    console.log('[EXEC TRACE]', traceId, stage, fields);
  }
}

/**
 * Production disconnect forensics — pair with Telnyx + backend logs.
 * @param {string} reason
 * @param {Record<string, unknown>} fields
 */
function logCallDropSource(reason, fields = {}) {
  try {
    console.warn('[CALL DROP SOURCE]', {
      reason,
      t: new Date().toISOString(),
      ...fields,
    });
  } catch {
    console.warn('[CALL DROP SOURCE]', reason, fields);
  }
}

/** Snapshot for [CALL DROP SOURCE] lines (no React refs — pass values in). */
function snapshotTelnyxLegForDropLog(call, telnyxClient, durationSec, uiCallState, extra = {}) {
  const pc = call?.peer?.instance;
  let websocketState = null;
  try {
    websocketState =
      telnyxClient?.connection?.state ??
      telnyxClient?.session?.connection?.state ??
      (typeof telnyxClient?.connected === 'boolean'
        ? telnyxClient.connected
          ? 'client_connected_true'
          : 'client_connected_false'
        : null);
  } catch (_) {
    websocketState = 'unknown';
  }
  return {
    ...extra,
    sdkState: call ? normalizeTelnyxCallState(getRawTelnyxCallState(call)) : null,
    callState: uiCallState ?? null,
    peerConnectionState: pc?.connectionState ?? null,
    iceConnectionState: pc?.iceConnectionState ?? null,
    websocketState,
    activeCallDurationSec: durationSec ?? 0,
    callControlId: call?.callControlId ?? null,
    callId: call?.id ?? null,
  };
}

function traceHeaders(traceId) {
  return traceId && typeof traceId === 'string'
    ? { headers: { 'x-oto-exec-trace': traceId } }
    : {};
}

/** Telnyx @telnyx/webrtc uses Direction.Inbound / Outbound and State as 0–11 */
const TELNYX_STATE_NAMES = [
  'new',
  'requesting',
  'trying',
  'recovering',
  'ringing',
  'answering',
  'early',
  'active',
  'held',
  'hangup',
  'destroy',
  'purge',
];

function normalizeTelnyxCallState(state) {
  if (typeof state === 'number' && state >= 0 && state < TELNYX_STATE_NAMES.length) {
    return TELNYX_STATE_NAMES[state];
  }
  if (typeof state === 'string') {
    const t = state.trim();
    if (t === '') return '';
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 0 && n < TELNYX_STATE_NAMES.length) return TELNYX_STATE_NAMES[n];
    }
    const lower = t.toLowerCase();
    // Call parking: agent leg often reports "parked" while PSTN rings — same UI progression as trying.
    if (lower === 'parked') return 'trying';
    return lower;
  }
  if (state == null || state === '') return '';
  return String(state).toLowerCase();
}

/** Prefer public `state` (string); fall back to SDK internal `_state` (enum index) */
function getRawTelnyxCallState(call) {
  if (!call) return null;
  const s = call.state;
  if (s != null && s !== '') return s;
  if (typeof call._state === 'number') return call._state;
  return null;
}

function isInboundTelnyxCall(call) {
  if (!call) return false;
  const d = String(call.direction ?? '').toLowerCase();
  return d === 'inbound' || d === 'incoming';
}

function getTelnyxRankByRaw(raw) {
  if (raw === 'active') return 50;
  if (raw === 'held') return 45;
  if (raw === 'answering') return 40;
  if (raw === 'ringing' || raw === 'early') return 30;
  if (raw === 'trying' || raw === 'recovering' || raw === 'parked') return 20;
  if (raw === 'new' || raw === 'requesting') return 10;
  if (raw === 'hangup' || raw === 'destroy' || raw === 'purge') return 0;
  return 5;
}

function getTelnyxCallRank(call) {
  const raw = normalizeTelnyxCallState(getRawTelnyxCallState(call));
  return getTelnyxRankByRaw(raw);
}

function isTelnyxTerminalCall(call) {
  const raw = normalizeTelnyxCallState(getRawTelnyxCallState(call));
  return raw === 'hangup' || raw === 'destroy' || raw === 'purge';
}

/**
 * During outbound, Telnyx often keeps two legs: a stale `newCall()` object + a bridge leg.
 * Same rank → prefer inbound-tagged (PSTN B-leg), then newer arrival.
 */
function pickBestOutboundLeg(list, arrivalMsById) {
  if (!list?.length) return null;
  return list.reduce((best, x) => {
    const rx = getTelnyxCallRank(x);
    const rb = getTelnyxCallRank(best);
    if (rx !== rb) return rx > rb ? x : best;
    const ix = isInboundTelnyxCall(x) ? 1 : 0;
    const ib = isInboundTelnyxCall(best) ? 1 : 0;
    if (ix !== ib) return ix > ib ? x : best;
    const tx = arrivalMsById[x.id] ?? 0;
    const tb = arrivalMsById[best.id] ?? 0;
    return tx >= tb ? x : best;
  });
}

/**
 * True when RTP audio from the far end is present on this leg (not necessarily reflected in Verto `state`).
 * Park/bridge toll-free often keeps the original `newCall()` leg pre-active while a sibling carries media.
 */
function callHasLiveRemoteAudio(call) {
  if (!call) return false;
  try {
    const rs = call.remoteStream;
    if (rs && typeof rs.getAudioTracks === 'function') {
      const tracks = rs.getAudioTracks();
      if (tracks.some((t) => t.readyState === 'live')) return true;
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const pc = call.peer?.instance;
    if (!pc || typeof pc.getReceivers !== 'function') return false;
    for (const r of pc.getReceivers()) {
      const tr = r?.track;
      if (tr && tr.kind === 'audio' && tr.readyState === 'live') return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

function logMediaPipeline(fields = {}) {
  telecomStructuredLog('[MEDIA FLOW]', {
    sourcePath: 'CallContext.jsx:logMediaPipeline',
    userId: null,
    callControlId: fields.telnyxCallControlId ?? null,
    currentStatus: fields.currentUiCallState ?? null,
    ...fields,
  });
}

function stopTelnyxSdkRingbackEverywhere(client) {
  if (!client?.calls) return;
  try {
    for (const c of Object.values(client.calls)) {
      if (c && typeof c.stopRingback === 'function') {
        try {
          c.stopRingback();
        } catch (_) {
          /* ignore */
        }
      }
    }
  } catch (_) {
    /* ignore */
  }
}

/** Same JS call object as the active user-placed outbound dial — Telnyx often mislabels PSTN legs as "inbound". */
function isActiveOutboundLeg(call, outboundDialActiveRef, currentCallRef) {
  return !!(call && outboundDialActiveRef.current && currentCallRef.current === call);
}

/** Use for routing to incoming UI / ringback — never treat the active outbound leg as inbound. */
function isInboundIncomingForUi(call, outboundDialActiveRef, currentCallRef) {
  if (isActiveOutboundLeg(call, outboundDialActiveRef, currentCallRef)) return false;
  // Telnyx often emits a second PSTN leg tagged "inbound" during an outbound dial — not a real incoming call
  if (outboundDialActiveRef.current) return false;
  return isInboundTelnyxCall(call);
}

function shouldClearStaleOutboundSession({
  outboundDialActiveRef,
  outboundDialStartedAtRef,
  callStateRef,
  currentCallRef,
  telnyxClientRef,
}) {
  if (!outboundDialActiveRef.current) return false;
  const startedAt = Number(outboundDialStartedAtRef.current || 0);
  if (startedAt > 0 && Date.now() - startedAt > 120000) return true;

  const state = callStateRef.current;
  if (state !== CALL_STATES.IDLE && state !== CALL_STATES.INCOMING) return false;

  const current = currentCallRef.current;
  const activeLegs = Object.values(telnyxClientRef.current?.calls || {}).filter(
    (c) => c && !isTelnyxTerminalCall(c)
  );
  return !current && activeLegs.length === 0;
}

/** Do not regress UI from ringing/active to dialing when a stale leg keeps emitting new/trying. */
function shouldHoldOutboundUiRank(callStateRef) {
  const s = callStateRef.current;
  return (
    s === CALL_STATES.RINGING ||
    s === CALL_STATES.ACTIVE ||
    s === CALL_STATES.CONNECTING ||
    s === CALL_STATES.HELD
  );
}

const TELNYX_REMOTE_AUDIO_ID = 'telnyx-remote-audio';

/** Shown when Telnyx ends the call with a known routing / policy cause (not an app bug). */
const TELNYX_FAIL_HINTS = {
  EXCHANGE_ROUTING_ERROR:
    'Telnyx routing failed (cause 25), often on +1-800/888… after ring. The server repair sets Outbound Voice Profile (global + US + uitf), links it under credential outbound, sets US localization, and forces ANI override to your E.164 caller ID for toll-free. If this still appears, contact Telnyx support with the exact time and destination — toll-free termination may need to be enabled on the account.',
  UNALLOCATED_NUMBER:
    'The number does not exist or is not complete. US/Canada numbers must be +1 followed by exactly 10 digits (e.g. +16465550100). Check for a missing digit or wrong country code.',
};

/** User-facing end states before falling back to raw Telnyx causes */
function mapOutboundHangupUserMessage({
  causeNorm,
  causeCode,
  hadAnswered,
  sawRinging,
}) {
  if (hadAnswered) return null;
  if (
    causeNorm === 'RECOVERY_ON_TIMER_EXPIRE' ||
    causeNorm === 'INTERWORKING' ||
    causeNorm === 'NETWORK_OUT_OF_ORDER'
  ) {
    return 'Carrier timeout';
  }
  const busy = new Set(['USER_BUSY', 'BUSY']);
  const noAnswer = new Set(['NO_ANSWER', 'NO_USER_RESPONSE', 'SUBSCRIBER_ABSENT', 'ALLOTTED_TIMEOUT']);
  const reject = new Set(['CALL_REJECTED', 'DECLINE']);
  if (busy.has(causeNorm)) return 'Busy';
  if (noAnswer.has(causeNorm)) return 'No answer';
  if (reject.has(causeNorm)) return 'Call declined';
  if (causeNorm === 'ORIGINATOR_CANCEL' || causeNorm === 'ORIGINATOR_CANCELLED') {
    return 'Canceled';
  }
  const q = Number(causeCode);
  if (Number.isFinite(q)) {
    if (q === 486 || q === 600) return 'Busy';
    if (q === 487 || q === 408) return 'No answer';
    if (q === 603) return 'Call declined';
  }
  if (!sawRinging && causeNorm === 'NORMAL_CLEARING') return 'Call ended';
  return null;
}

/** ITU E.164 — same idea as backend `validateE164`; NANP (+1…) must be exactly 10 digits after the country code. */
function validateE164(number) {
  const s = String(number ?? '')
    .replace(/\s/g, '')
    .trim();
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return false;
  if (s.startsWith('+1')) {
    return /^\+1\d{10}$/.test(s);
  }
  return true;
}

/**
 * Outbound PSTN destination: require explicit E.164 (+…) or 00… international prefix.
 * Rejects 10-digit national-only input (no leading +).
 */
function toOutboundDestinationE164(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const trimmed = String(raw).trim();
  if (trimmed.toLowerCase().startsWith('sip:')) return trimmed;
  let t = trimmed.replace(/\s/g, '');
  if (t.startsWith('00')) t = `+${t.slice(2)}`;
  if (!t.startsWith('+')) return null;
  const digits = `+${t.slice(1).replace(/\D/g, '')}`;
  return validateE164(digits) ? digits : null;
}

function mergeHangupMetaFromTelnyx(call, event) {
  const ev = event && typeof event === 'object' ? event : {};
  const params =
    ev.params && typeof ev.params === 'object' ? ev.params : {};
  const cause =
    ev.cause ??
    ev.hangup_cause ??
    ev.hangupCause ??
    params.cause ??
    params.hangup_cause ??
    (call?.cause != null && String(call.cause).trim() !== '' ? call.cause : null) ??
    (call?.sipReason != null && String(call.sipReason).trim() !== ''
      ? call.sipReason
      : null) ??
    null;
  const causeCode =
    ev.cause_code ??
    ev.causeCode ??
    params.cause_code ??
    params.causeCode ??
    call?.causeCode ??
    call?.sipCode ??
    null;
  return {
    cause:
      cause != null && String(cause).trim() !== ''
        ? String(cause).trim()
        : null,
    causeCode: causeCode != null ? causeCode : null,
  };
}

/** Prefer first non-empty cause (hangup event vs state transition — do not clobber). */
function mergeHangupMetaPrefer(prev, next) {
  const a = prev && typeof prev === 'object' ? prev : {};
  const b = next && typeof next === 'object' ? next : {};
  const causeA = a.cause != null && String(a.cause).trim() !== '' ? String(a.cause).trim() : '';
  const causeB = b.cause != null && String(b.cause).trim() !== '' ? String(b.cause).trim() : '';
  const cause = causeA || causeB || null;
  const codeA = a.causeCode != null && a.causeCode !== '' ? a.causeCode : null;
  const codeB = b.causeCode != null && b.causeCode !== '' ? b.causeCode : null;
  const causeCode = codeA ?? codeB ?? null;
  return { cause, causeCode };
}

/** E.164 for PSTN; leave sip: URIs unchanged */
function normalizeDialNumber(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (s.toLowerCase().startsWith('sip:')) return s;
  if (s.startsWith('+')) return s.replace(/\s/g, '');
  const digits = s.replace(/\D/g, '');
  if (!digits) return s;
  const cc = String(import.meta.env.VITE_DEFAULT_DIAL_COUNTRY_CODE || '1').replace(/\D/g, '') || '1';
  if (cc === '1' && digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    console.warn('useCall used outside of CallProvider');
    return {
      callState: CALL_STATES.IDLE,
      callDuration: 0,
      isMuted: false,
      isOnHold: false,
      isSpeaker: false,
      remoteNumber: '',
      incomingCall: null,
      error: null,
      isMinimized: false,
      initializeClient: async () => false,
      makeCall: async () => false,
      answerCall: () => {},
      rejectCall: () => {},
      hangUp: () => {},
      toggleMute: () => {},
      toggleHold: () => {},
      toggleSpeaker: () => {},
      sendDTMF: () => {},
      formatDuration: () => '00:00',
      minimizeCall: () => {},
      expandCall: () => {},
      callingMode: "webrtc",
      CALL_STATES,
      callPhaseLabel: null,
      isInCall: false,
      isRinging: false,
      isActive: false,
      hasIncomingCall: false,
      isClientReady: false
    };
  }
  return context;
};

export const CallProvider = ({ children }) => {
  // Call state
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [remoteNumber, setRemoteNumber] = useState('');
  const [incomingCall, setIncomingCall] = useState(null);
  const [error, setError] = useState(null);
  const [callPhaseLabel, setCallPhaseLabel] = useState(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const latestWebrtcCredsRef = useRef(null);
  /** True once GET /api/webrtc/token returned usable creds — updated immediately (not tied to React state). */
  const webrtcCredentialsReadyRef = useRef(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  /** Outbound calls are WebRTC (Telnyx SIP) only — no Voice API /v2/calls. */
  const callingMode = "webrtc";

  // Keep screen awake during active calls (mobile)
  const isActiveCall =
    callState === CALL_STATES.ACTIVE ||
    callState === CALL_STATES.RINGING ||
    callState === CALL_STATES.INCOMING ||
    callState === CALL_STATES.DIALING ||
    callState === CALL_STATES.CONNECTING;
  useWakeLock(isActiveCall);

  // Refs
  const telnyxClientRef = useRef(null);
  const currentCallRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const callStateRef = useRef(callState);
  const remoteAudioRef = useRef(null);
  const initializationPromiseRef = useRef(null);
  const isInitializedRef = useRef(false);
  /** Avoid killing Telnyx during React 18 StrictMode fake unmount / quick remount */
  const callProviderAliveRef = useRef(true);
  const unmountDisconnectTimerRef = useRef(null);
  const isSpeakerRef = useRef(isSpeaker);
  const callDurationRef = useRef(0);
  const isClientReadyRef = useRef(isClientReady);
  const isInitializingRef = useRef(isInitializing);
  const notificationRef = useRef(null);
  const applyAudioRoutingRef = useRef(null);
  /** After hangup, ignore API "ringing inbound" poll hits (stale legs / webhook delay) */
  const pollBypassUntilRef = useRef(0);
  const lastPolledIncomingIdRef = useRef(null);
  const polledCallIdRef = useRef(null);
  /** True from outbound dial start until handleCallEnd — blocks API poll during CONNECTING before `currentCallRef` is set */
  const outboundDialActiveRef = useRef(false);
  const outboundDialStartedAtRef = useRef(0);
  /** Poll SDK call.state — some builds/envs omit telnyx.notification callUpdate for outbound */
  const sdkCallStatePollRef = useRef(null);
  /** PATCH /api/calls once per phase for outbound WebRTC (SDK is source of truth). */
  const webRtcDbSyncRef = useRef({
    ringing: false,
    active: false,
    terminal: false,
  });
  /** Dedupe handleCallStateChange switch path (audio attach still runs above) */
  const lastCallUiFingerprintRef = useRef('');
  /** Drop bogus SDK "incoming" legs with no caller id right after hangup */
  const ignoreGhostIncomingUntilRef = useRef(0);
  /** True once we started ringback for this session (avoid repeat) */
  const outboundRingbackStartedRef = useRef(false);
  /** DB row id for this outbound session — copy onto any adopted Telnyx leg */
  const outboundCallRecordIdRef = useRef(null);
  const authoritativeBackendSeqRef = useRef(0);
  /** `newCall()` return value — often not the leg that actually rings PSTN */
  const outboundNewCallLegRef = useRef(null);
  /** call.id -> Date.now() when first seen during this outbound session */
  const outboundLegArrivalMsRef = useRef({});
  /** One-shot delayed media attach per DB call id (park/bridge race) */
  const outboundMediaRetryOnceRef = useRef(new Set());
  /** Remove if call ends before user gesture (autoplay unlock) */
  const audioUnlockHandlerRef = useRef(null);
  /** User tapped hang up / reject — do not "hand off" to another leg */
  const userEndedFullCallRef = useRef(false);
  const handledIncomingCallIdsRef = useRef(new Set());
  const handledTerminalCallIdsRef = useRef(new Set());
  const manualHangupRef = useRef(false);
  const hasAttemptedPhoneConfigFixRef = useRef(false);
  const lastPhoneConfigFixAtRef = useRef(0);
  /** Latest Telnyx `cause` / `causeCode` for outbound terminal PATCH + UI */
  const lastOutboundHangupMetaRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);
  
  useEffect(() => {
    isSpeakerRef.current = isSpeaker;
  }, [isSpeaker]);
  
  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);
  
  useEffect(() => {
    isClientReadyRef.current = isClientReady;
  }, [isClientReady]);
  
  useEffect(() => {
    isInitializingRef.current = isInitializing;
  }, [isInitializing]);

  /** Keep ref aligned with SDK reality immediately — do not rely only on useEffect after telnyx.ready. */
  const syncClientReady = useCallback((next) => {
    isClientReadyRef.current = next;
    setIsClientReady(next);
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          console.log('📱 Notification permission:', permission);
        });
      } else {
        console.log('📱 Notification permission:', Notification.permission);
      }
    }
  }, []);

  // Create hidden audio element for remote audio
  useEffect(() => {
    if (!remoteAudioRef.current) {
      const audio = document.createElement('audio');
      audio.id = TELNYX_REMOTE_AUDIO_ID;
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute('playsinline', 'true');
      // Set default to earpiece (not speaker) - lower volume for earpiece
      audio.volume = 0.8;
      // Prevent errors from being thrown
      audio.onerror = (e) => {
        console.warn('Audio element error (non-critical):', e);
      };
      document.body.appendChild(audio);
      remoteAudioRef.current = audio;
      console.log('📱 Audio element created and configured for earpiece');
    }
    return () => {
      if (remoteAudioRef.current) {
        try {
          remoteAudioRef.current.srcObject = null;
          remoteAudioRef.current.remove();
          remoteAudioRef.current = null;
        } catch (err) {
          console.warn('Error cleaning up audio element:', err);
        }
      }
    };
  }, []);

  // Start call duration timer
  const startDurationTimer = useCallback(() => {
    try {
      setCallDuration(0);
      callDurationRef.current = 0;
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      durationIntervalRef.current = setInterval(() => {
        try {
          callDurationRef.current += 1;
          setCallDuration(callDurationRef.current);
        } catch (err) {
          console.warn('Error updating call duration (non-critical):', err);
        }
      }, 1000);
    } catch (err) {
      console.error('Error starting duration timer (handled):', err);
    }
  }, []);

  /** Clear outbound session bookkeeping (retry / early-fail paths; safe no-op extras after handleCallEnd). */
  const resetOutboundRetryState = useCallback(() => {
    outboundDialActiveRef.current = false;
    outboundDialStartedAtRef.current = 0;
    outboundRingbackStartedRef.current = false;
    outboundCallRecordIdRef.current = null;
    outboundNewCallLegRef.current = null;
    outboundLegArrivalMsRef.current = {};
    webRtcDbSyncRef.current = { ringing: false, active: false, terminal: false };
  }, []);

  // Handle call end
  const handleCallEnd = useCallback(
    async ({ preserveError = false, finalStatus = "completed", dropSource = null } = {}) => {
    let userVisibleFailMessage = null;
    try {
      const clientSnap = telnyxClientRef.current;
      const legSnap = currentCallRef.current;
      logCallDropSource(
        dropSource?.reason || 'handleCallEnd',
        snapshotTelnyxLegForDropLog(legSnap, clientSnap, callDurationRef.current, callStateRef.current, {
          eventName: dropSource?.eventName ?? null,
          userId: null,
          note: dropSource?.note ?? null,
        })
      );
      console.log('📱 Call ended, cleaning up...');

      const oid = outboundCallRecordIdRef.current;
      if (oid && !webRtcDbSyncRef.current.terminal) {
        const sawRinging = webRtcDbSyncRef.current.ringing;
        webRtcDbSyncRef.current.terminal = true;
        const wasActive = callStateRef.current === CALL_STATES.ACTIVE;
        const dur = callDurationRef.current;
        const meta = lastOutboundHangupMetaRef.current;
        const causeRaw =
          meta?.cause != null && String(meta.cause).trim() !== ''
            ? String(meta.cause).trim()
            : '';
        const causeNorm = causeRaw.replace(/\s+/g, '_').toUpperCase();
        const qCode = Number(meta?.causeCode);
        const hadAnswered =
          wasActive ||
          callStateRef.current === CALL_STATES.HELD ||
          webRtcDbSyncRef.current.active;
        // Telnyx/SIP often use these for hangup before or after answer — not a "broken" call.
        const completedHangupCauses = new Set([
          'NORMAL_CLEARING',
          'NORMAL_CALL_CLEARING',
          'ORIGINATOR_CANCEL',
          'ORIGINATOR_CANCELLED',
          'NORMAL_UNSPECIFIED',
          'LOSE_RACE',
          'SYSTEM_SHUTDOWN',
          'MEDIA_TIMEOUT',
        ]);
        let terminalStatus = 'completed';
        if (!hadAnswered) {
          if (
            causeNorm === 'USER_BUSY' ||
            causeNorm === 'BUSY' ||
            qCode === 486
          ) {
            terminalStatus = 'busy';
          } else if (sawRinging) {
            terminalStatus = 'no-answer';
          } else {
            terminalStatus = 'failed';
          }
        } else if (completedHangupCauses.has(causeNorm)) {
          terminalStatus = 'completed';
        } else if (!causeRaw && wasActive) {
          terminalStatus = 'completed';
        } else if (!causeRaw && dur <= 2 && !sawRinging) {
          const sipReject = new Set([403, 404, 486, 487, 603, 604, 606]);
          const q850Reject = new Set([
            17, 19, 20, 21, 34, 38, 41, 42, 47, 50, 57, 58, 63, 65, 69, 87, 88,
            102, 111,
          ]);
          const looksReject =
            Number.isFinite(qCode) &&
            (sipReject.has(qCode) || q850Reject.has(qCode));
          if (!looksReject) {
            // A-leg often ends with no text cause before ring — not the same as coded reject.
            terminalStatus = 'completed';
          }
        }
        const hangupCauseDb =
          causeRaw ||
          (terminalStatus === 'failed' || terminalStatus === 'no-answer'
            ? 'UNKNOWN'
            : null);
        const hangupCauseCodeDb =
          meta?.causeCode != null && meta?.causeCode !== ''
            ? String(meta.causeCode)
            : null;
        console.log("[WEBRTC] HANGUP", {
          terminalStatus,
          hangupCause: hangupCauseDb,
          hangupCauseCode: hangupCauseCodeDb,
          wasActive,
        });
        if (terminalStatus === 'failed' && hangupCauseDb) {
          const friendly = mapOutboundHangupUserMessage({
            causeNorm,
            causeCode: hangupCauseCodeDb,
            hadAnswered,
            sawRinging,
          });
          const hint = TELNYX_FAIL_HINTS[causeNorm];
          if (friendly) {
            userVisibleFailMessage = hint ? `${friendly}\n\n${hint}` : friendly;
          } else {
            userVisibleFailMessage = `Call failed: ${hangupCauseDb}${
              hangupCauseCodeDb ? ` (${hangupCauseCodeDb})` : ''
            }`;
            if (hint) {
              userVisibleFailMessage = `${userVisibleFailMessage}\n\n${hint}`;
            }
          }
        }
        void API.patch(`/api/calls/${oid}`, {
          status: terminalStatus,
          callEndedAt: new Date().toISOString(),
          durationSeconds: dur,
          ...(hangupCauseDb ? { hangupCause: hangupCauseDb } : {}),
          ...(hangupCauseCodeDb ? { hangupCauseCode: hangupCauseCodeDb } : {}),
        }).catch((e) => {
          console.error("[WEBRTC] terminal PATCH failed:", e);
        });
      }
      lastOutboundHangupMetaRef.current = null;

      pollBypassUntilRef.current = Date.now() + 60000;
      ignoreGhostIncomingUntilRef.current = Date.now() + 120000;
      polledCallIdRef.current = null;
      lastPolledIncomingIdRef.current = null;
      outboundDialActiveRef.current = false;
      outboundDialStartedAtRef.current = 0;
      outboundRingbackStartedRef.current = false;
      outboundCallRecordIdRef.current = null;
      outboundNewCallLegRef.current = null;
      outboundLegArrivalMsRef.current = {};
      userEndedFullCallRef.current = false;
      lastCallUiFingerprintRef.current = '';
      if (sdkCallStatePollRef.current != null) {
        clearInterval(sdkCallStatePollRef.current);
        sdkCallStatePollRef.current = null;
      }

      // Stop sounds safely
      try {
        soundManager.stopAll();
        soundManager.playEnded();
      } catch (soundErr) {
        console.warn('Error stopping sounds (non-critical):', soundErr);
      }

      // Clean up timer
      try {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      } catch (timerErr) {
        console.warn('Error clearing timer (non-critical):', timerErr);
      }

      // Clean up audio
      try {
        if (audioUnlockHandlerRef.current) {
          document.removeEventListener('pointerdown', audioUnlockHandlerRef.current);
          audioUnlockHandlerRef.current = null;
        }
        outboundMediaRetryOnceRef.current.clear();
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = null;
        }
      } catch (audioErr) {
        console.warn('Error cleaning up audio (non-critical):', audioErr);
      }

      // Reset all state
      try {
        currentCallRef.current = null;
        setCallState(CALL_STATES.IDLE);
        setCallDuration(0);
        callDurationRef.current = 0;
        setIsMuted(false);
        setIsOnHold(false);
        // Keep last dialed number so the call UI never flips to "Unknown" if a late SDK leg fires after hangup
        if (userVisibleFailMessage) {
          setError(userVisibleFailMessage);
        } else if (!preserveError) {
          setError(null);
        }
        setIncomingCall(null);
        setIsMinimized(false);
        setCallPhaseLabel(null);
        handledIncomingCallIdsRef.current.clear();
        handledTerminalCallIdsRef.current.clear();
        manualHangupRef.current = false;
        resetOutboundRetryState();
      } catch (stateErr) {
        console.error('Error resetting call state (handled):', stateErr);
        // Try to at least set to idle
        try {
          setCallState(CALL_STATES.IDLE);
        } catch (e) {
          console.error('Critical: Failed to reset call state:', e);
        }
      }
    } catch (err) {
      console.error('Error in handleCallEnd (handled):', err);
      // Try to reset state even if cleanup fails
      try {
        setCallState(CALL_STATES.IDLE);
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        handledIncomingCallIdsRef.current.clear();
        handledTerminalCallIdsRef.current.clear();
        manualHangupRef.current = false;
        resetOutboundRetryState();
      } catch (e) {
        console.error('Critical: Failed to reset call state:', e);
      }
    }
  }, [resetOutboundRetryState]);

  const startDurationTimerRef = useRef(startDurationTimer);
  startDurationTimerRef.current = startDurationTimer;

  const handleCallEndRef = useRef(handleCallEnd);
  handleCallEndRef.current = handleCallEnd;

  // Server reconciliation + heartbeat while a session is open (outbound row required).
  useEffect(() => {
    if (callState === CALL_STATES.IDLE) return undefined;

    const syncFromServer = async () => {
      const id = outboundCallRecordIdRef.current;
      if (!id) return;
      try {
        const res = await API.get(`/api/calls/${id}`, { timeout: 70000 });
        if (typeof res.status === 'number' && res.status >= 400) return;
        const doc = res.data?.call;
        if (!doc) return;
        const st = doc.status;
        if (
          ['completed', 'failed', 'no-answer', 'busy', 'rejected', 'canceled'].includes(st) &&
          callStateRef.current !== CALL_STATES.IDLE
        ) {
          console.warn('[CALL FLOW] server reports terminal call; syncing UI', st);
          handleCallEndRef.current?.({
            preserveError: true,
            dropSource: {
              reason: 'server_call_document_terminal',
              eventName: st,
              note: 'GET /api/calls/:id reconciliation poll',
            },
          });
        }
      } catch (_) {
        /* ignore */
      }
    };

    const hb = setInterval(() => {
      const id = outboundCallRecordIdRef.current;
      if (!id) return;
      void API.patch(`/api/calls/${id}`, {
        lastHeartbeatAt: new Date().toISOString(),
      }).catch(() => {});
    }, 15000);

    const poll = setInterval(syncFromServer, 5000);
    void syncFromServer();

    return () => {
      clearInterval(hb);
      clearInterval(poll);
    };
  }, [callState]);

  // Handle call state updates from Telnyx
  const handleCallStateChange = useCallback(async (call) => {
    if (!call) return;
    
    // Wrap entire function in try-catch to prevent any errors from propagating
    try {
      const rawState = getRawTelnyxCallState(call);
      const state = normalizeTelnyxCallState(rawState);
      console.log('📱 Call state changed:', state, '(raw:', rawState, ') direction:', call.direction, call);

      // Inbound ringing: handle BEFORE currentCallRef. Skip if this is our outbound PSTN leg (often mis-tagged inbound).
      if (
        state === 'ringing' &&
        isInboundIncomingForUi(call, outboundDialActiveRef, currentCallRef) &&
        callStateRef.current !== CALL_STATES.INCOMING
      ) {
        try {
          handleIncomingCallEventRef.current(call);
        } catch (err) {
          console.error('Error handling incoming call (handled):', err);
        }
        return;
      }

      currentCallRef.current = call;
      if (outboundDialActiveRef.current && call && !call._dbCallId && outboundCallRecordIdRef.current) {
        call._dbCallId = outboundCallRecordIdRef.current;
      }

      // Use whichever session leg actually has remote RTP (often not the `newCall()` object after park/bridge).
      let audioSource = call;
      if (outboundDialActiveRef.current) {
        const rtcClient = telnyxClientRef.current;
        if (rtcClient?.calls) {
          const sessionLegs = Object.values(rtcClient.calls).filter(
            (c) => c && !isTelnyxTerminalCall(c)
          );
          const withMedia = sessionLegs.filter(callHasLiveRemoteAudio);
          if (withMedia.length) {
            const bestMediaLeg = pickBestOutboundLeg(withMedia, outboundLegArrivalMsRef.current);
            audioSource = bestMediaLeg || withMedia[0];
            if (!audioSource._dbCallId && outboundCallRecordIdRef.current) {
              audioSource._dbCallId = outboundCallRecordIdRef.current;
            }
            currentCallRef.current = audioSource;
          }
        }
      }

      // Attach remote audio stream when available
      try {
      if (audioSource.remoteStream && remoteAudioRef.current) {
        if (remoteAudioRef.current.srcObject !== audioSource.remoteStream) {
          console.log('📱 Attaching remote audio stream (leg:', audioSource.id, ')');
          logMediaPipeline({
            phase: 'remote_stream_received',
            callId: audioSource._dbCallId || null,
            currentUiCallState: callStateRef.current,
            providerState: normalizeTelnyxCallState(getRawTelnyxCallState(audioSource)),
            bridgeExecuted: null,
            bridgeSuccess: null,
            peerConnectionState: audioSource?.peer?.instance?.connectionState || null,
            iceConnectionState: audioSource?.peer?.instance?.iceConnectionState || null,
            remoteTracks:
              typeof audioSource.remoteStream.getAudioTracks === 'function'
                ? audioSource.remoteStream.getAudioTracks().length
                : 0,
            audioAttached: true,
            telnyxCallControlId: audioSource?.callControlId || null,
          });
          remoteAudioRef.current.srcObject = audioSource.remoteStream;
          
          // Set initial audio routing based on speaker state (use ref with safety)
          setTimeout(() => {
            try {
              if (remoteAudioRef.current && applyAudioRoutingRef.current) {
                applyAudioRoutingRef.current(remoteAudioRef.current, isSpeakerRef.current);
              }
            } catch (err) {
              console.warn('Audio routing error (handled):', err);
            }
          }, 50);
          
          try {
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = 1.0;
          } catch (volErr) {
            console.error('Remote audio volume/mute:', volErr);
          }
          remoteAudioRef.current.play().catch((e) => {
            console.warn('Audio play failed:', e);
            const name = String(e?.name || "");
            if (name === "NotAllowedError" || name === "AbortError") {
              setError("Audio playback was blocked by the browser. Tap the call screen once to enable audio.");
              if (audioUnlockHandlerRef.current) {
                document.removeEventListener('pointerdown', audioUnlockHandlerRef.current);
                audioUnlockHandlerRef.current = null;
              }
              const unlockAudioOnce = () => {
                audioUnlockHandlerRef.current = null;
                try {
                  if (remoteAudioRef.current?.srcObject) {
                    remoteAudioRef.current.play().catch(() => {});
                  }
                } catch (_) {
                  /* ignore */
                }
              };
              audioUnlockHandlerRef.current = unlockAudioOnce;
              document.addEventListener("pointerdown", unlockAudioOnce, { once: true });
            }
          });
        }
      }
    } catch (audioErr) {
      console.warn('Error attaching audio stream (non-critical):', audioErr);
    }

    const uiFp = `${call.id ?? ''}|${state}`;
    if (state && lastCallUiFingerprintRef.current === uiFp) {
      return;
    }
    if (state) lastCallUiFingerprintRef.current = uiFp;

    try {
      switch (state) {
      case '':
      case 'new':
      case 'requesting':
        if (isInboundIncomingForUi(call, outboundDialActiveRef, currentCallRef)) {
          try {
            setCallState(CALL_STATES.CONNECTING);
            setCallPhaseLabel('Connecting...');
            console.log('[CALL FLOW] STATE UPDATED → connecting (inbound early)');
          } catch (err) {
            console.error('Error setting connecting state (handled):', err);
          }
        } else {
          if (shouldHoldOutboundUiRank(callStateRef)) {
            break;
          }
          try {
            setCallState(CALL_STATES.DIALING);
            setCallPhaseLabel('Connecting...');
            console.log('[CALL FLOW] STATE UPDATED → dialing (Telnyx new/requesting)');
          } catch (err) {
            console.error('Error in outbound new→dialing UI (handled):', err);
            setCallState(CALL_STATES.DIALING);
            setCallPhaseLabel('Connecting...');
          }
        }
        break;
      case 'trying':
      case 'recovering':
        if (isInboundIncomingForUi(call, outboundDialActiveRef, currentCallRef)) {
          try {
            setCallState(CALL_STATES.CONNECTING);
            setCallPhaseLabel('Connecting...');
            console.log('[CALL FLOW] STATE UPDATED → connecting (inbound trying)');
          } catch (err) {
            console.error('Error setting connecting state (handled):', err);
          }
        } else if (outboundDialActiveRef.current) {
          if (webRtcDbSyncRef.current.active) {
            break;
          }
          // Outbound: many carriers never emit SIP 180/183 before a fast failure — treat session progress as "ringing"
          // so the UI and DB show ringing + ringback instead of stalling on "dialing".
          if (
            callStateRef.current === CALL_STATES.ACTIVE ||
            callStateRef.current === CALL_STATES.HELD
          ) {
            break;
          }
          try {
            call._sawRinging = true;
            if (
              call._dbCallId &&
              !webRtcDbSyncRef.current.ringing
            ) {
              webRtcDbSyncRef.current.ringing = true;
              console.log('[WEBRTC] RINGING (from trying/recovering)');
              void API.patch(`/api/calls/${call._dbCallId}`, {
                status: 'ringing',
              }).catch((e) => console.warn('[WEBRTC] ringing PATCH:', e));
            }
            setCallState(CALL_STATES.RINGING);
            setCallPhaseLabel('Ringing...');
            console.log(
              '[CALL FLOW] STATE UPDATED → ringing (outbound trying/recovering — PSTN in progress)'
            );
            if (!outboundRingbackStartedRef.current) {
              outboundRingbackStartedRef.current = true;
              try {
                soundManager.startRingback();
              } catch (soundErr) {
                console.warn('Sound manager error (non-critical):', soundErr);
              }
            }
          } catch (err) {
            console.error('Error in outbound trying→ringing UI (handled):', err);
            setCallState(CALL_STATES.RINGING);
            setCallPhaseLabel('Ringing...');
          }
        } else {
          if (shouldHoldOutboundUiRank(callStateRef)) {
            break;
          }
          try {
            setCallState(CALL_STATES.DIALING);
            setCallPhaseLabel('Connecting...');
            console.log('[CALL FLOW] STATE UPDATED → dialing (Telnyx trying/recovering)');
          } catch (err) {
            console.error('Error in outbound trying→dialing UI (handled):', err);
            setCallState(CALL_STATES.DIALING);
            setCallPhaseLabel('Connecting...');
          }
        }
        break;
      case 'ringing':
      case 'early':
        if (webRtcDbSyncRef.current.active) {
          break;
        }
        if (
          callStateRef.current === CALL_STATES.ACTIVE ||
          callStateRef.current === CALL_STATES.HELD
        ) {
          break;
        }
        try {
          // Mark synchronously to avoid relying on async React state timing.
          call._sawRinging = true;
          if (
            outboundDialActiveRef.current &&
            call._dbCallId &&
            !webRtcDbSyncRef.current.ringing
          ) {
            webRtcDbSyncRef.current.ringing = true;
            console.log("[WEBRTC] RINGING");
            void API.patch(`/api/calls/${call._dbCallId}`, {
              status: "ringing",
            }).catch((e) => console.warn("[WEBRTC] ringing PATCH:", e));
          }
          setCallState(CALL_STATES.RINGING);
          setCallPhaseLabel('Ringing...');
          console.log('[CALL FLOW] STATE UPDATED → ringing (Telnyx ringing/early)');
          if (!outboundRingbackStartedRef.current) {
            outboundRingbackStartedRef.current = true;
            try {
              soundManager.startRingback();
            } catch (soundErr) {
              console.warn('Sound manager error (non-critical):', soundErr);
            }
          }
        } catch (err) {
          console.error('Error in ringing state (handled):', err);
          setCallState(CALL_STATES.RINGING);
          setCallPhaseLabel('Ringing...');
        }
        break;
      case 'answering':
        try {
          setCallState(CALL_STATES.CONNECTING);
          setCallPhaseLabel('Connecting...');
        } catch (err) {
          console.error('Error setting answering state (handled):', err);
        }
        break;
      case 'active':
        try {
          if (outboundDialActiveRef.current) {
            const rtcClient = telnyxClientRef.current;
            const siblings = Object.values(rtcClient?.calls || {}).filter(
              (x) => x && x !== audioSource && !isTelnyxTerminalCall(x)
            );
            const hasPreAnswerSibling = siblings.some((x) => {
              const s = normalizeTelnyxCallState(getRawTelnyxCallState(x));
              return (
                s === 'new' ||
                s === 'requesting' ||
                s === 'trying' ||
                s === 'recovering' ||
                s === 'ringing' ||
                s === 'early' ||
                s === 'answering' ||
                s === 'parked'
              );
            });
            const liveRemote = callHasLiveRemoteAudio(audioSource);
            if (!liveRemote && hasPreAnswerSibling) {
              console.log('[CALL FLOW] Ignoring early active on parked/agent leg; awaiting real answer media');
              if (
                callStateRef.current !== CALL_STATES.ACTIVE &&
                callStateRef.current !== CALL_STATES.HELD
              ) {
                setCallState(CALL_STATES.RINGING);
                setCallPhaseLabel('Ringing...');
                if (!outboundRingbackStartedRef.current) {
                  outboundRingbackStartedRef.current = true;
                  try {
                    soundManager.startRingback();
                  } catch (_) {
                    /* ignore */
                  }
                }
              }
              break;
            }
          }

          // Mark synchronously to avoid relying on async React state timing.
          audioSource._sawActive = true;
          if (
            outboundDialActiveRef.current &&
            audioSource._dbCallId &&
            !webRtcDbSyncRef.current.active
          ) {
            webRtcDbSyncRef.current.active = true;
            console.log("[WEBRTC] ACTIVE");
            void API.patch(`/api/calls/${audioSource._dbCallId}`, {
              status: "in-progress",
              callStartedAt: new Date().toISOString(),
            }).catch((e) => console.warn("[WEBRTC] active PATCH:", e));
          }
          setCallPhaseLabel(null);
          setCallState(CALL_STATES.ACTIVE);
          console.log('[CALL FLOW] STATE UPDATED → active (Telnyx)');
          logMediaPipeline({
            phase: 'active_state',
            callId: audioSource._dbCallId || null,
            currentUiCallState: CALL_STATES.ACTIVE,
            providerState: state,
            bridgeExecuted: null,
            bridgeSuccess: null,
            peerConnectionState: audioSource?.peer?.instance?.connectionState || null,
            iceConnectionState: audioSource?.peer?.instance?.iceConnectionState || null,
            remoteTracks: callHasLiveRemoteAudio(audioSource) ? 1 : 0,
            audioAttached: Boolean(remoteAudioRef.current?.srcObject),
            telnyxCallControlId: audioSource?.callControlId || null,
          });
          stopTelnyxSdkRingbackEverywhere(telnyxClientRef.current);

          {
            const dbId = audioSource._dbCallId;
            const liveRemoteNow = callHasLiveRemoteAudio(audioSource);
            if (outboundDialActiveRef.current && dbId && !liveRemoteNow) {
              const key = String(dbId);
              if (!outboundMediaRetryOnceRef.current.has(key)) {
                outboundMediaRetryOnceRef.current.add(key);
                window.setTimeout(() => {
                  if (!outboundDialActiveRef.current) return;
                  if (String(outboundCallRecordIdRef.current || '') !== key) return;
                  try {
                    const rtcClient = telnyxClientRef.current;
                    const legs = Object.values(rtcClient?.calls || {}).filter(
                      (c) => c && !isTelnyxTerminalCall(c)
                    );
                    const withMedia = legs.filter(callHasLiveRemoteAudio);
                    const best =
                      pickBestOutboundLeg(withMedia, outboundLegArrivalMsRef.current) ||
                      withMedia[0];
                    if (!best?.remoteStream || !remoteAudioRef.current) {
                      telecomStructuredLog('[MEDIA FLOW]', {
                        sourcePath: 'CallContext.jsx:outbound_media_retry',
                        eventType: 'outbound_media_retry_miss',
                        callId: key,
                        userId: null,
                        callControlId: best?.callControlId || null,
                        currentStatus: callStateRef.current,
                        phase: 'retry_no_stream',
                      });
                      return;
                    }
                    if (remoteAudioRef.current.srcObject !== best.remoteStream) {
                      remoteAudioRef.current.srcObject = best.remoteStream;
                      remoteAudioRef.current
                        .play()
                        .catch(() => {});
                      telecomStructuredLog('[WEBRTC FLOW]', {
                        sourcePath: 'CallContext.jsx:outbound_media_retry',
                        eventType: 'outbound_media_retry_attach',
                        callId: key,
                        userId: null,
                        callControlId: best.callControlId || null,
                        currentStatus: callStateRef.current,
                        peerConnectionState: best?.peer?.instance?.connectionState || null,
                        iceConnectionState: best?.peer?.instance?.iceConnectionState || null,
                      });
                    }
                  } catch (_) {
                    /* ignore */
                  }
                }, 400);
              }
            }
          }

          // Stop sounds safely
          try {
            soundManager.stopRingback();
            soundManager.stopRingtone();
            soundManager.playConnected();
          } catch (soundErr) {
            console.warn('Sound manager error (non-critical):', soundErr);
          }

          // Start duration timer safely (media-promotion path may have started it already)
          try {
            if (!durationIntervalRef.current) {
              startDurationTimer();
            }
          } catch (timerErr) {
            console.warn('Duration timer error (non-critical):', timerErr);
          }

          // Ensure audio routing is applied when call becomes active
          if (remoteAudioRef.current && audioSource.remoteStream) {
            // Apply current speaker state
            setTimeout(() => {
              if (remoteAudioRef.current && applyAudioRoutingRef.current) {
                try {
                  applyAudioRoutingRef.current(remoteAudioRef.current, isSpeakerRef.current);
                } catch (err) {
                  console.warn('Error applying audio routing on active call (non-critical):', err);
                }
              }
            }, 100);
          }
          
        } catch (err) {
          // Catch any unexpected errors to prevent ErrorBoundary from triggering
          console.error('Error in active call state handler (handled):', err);
          // Still set the state to active even if other operations fail
          setCallPhaseLabel(null);
          setCallState(CALL_STATES.ACTIVE);
        }
        break;
      case 'held':
        try {
          setCallState(CALL_STATES.HELD);
        } catch (err) {
          console.error('Error setting held state (handled):', err);
        }
        break;
      case 'hangup':
      case 'destroy':
      case 'done':
      case 'purge':
        try {
          if (userEndedFullCallRef.current) {
            break;
          }
          const hadConnectedPhase =
            webRtcDbSyncRef.current.active ||
            Boolean(call?._sawActive) ||
            Boolean(currentCallRef.current?._sawActive) ||
            callStateRef.current === CALL_STATES.ACTIVE ||
            callStateRef.current === CALL_STATES.HELD ||
            (callDurationRef.current || 0) > 0;
          const client = telnyxClientRef.current;
          const allLegs = Object.values(client?.calls || {}).filter(Boolean);
          const remaining = allLegs.filter((x) => x !== call && !isTelnyxTerminalCall(x));

          const sessionStillAlive =
            outboundDialActiveRef.current &&
            hadConnectedPhase &&
            remaining.some((x) => {
              const s = normalizeTelnyxCallState(getRawTelnyxCallState(x));
              if (s === 'active' || s === 'held' || s === 'answering') return true;
              if (callHasLiveRemoteAudio(x)) return true;
              return false;
            });

          if (sessionStillAlive) {
            logCallDropSource('ignored_terminal_on_secondary_leg', {
              ...snapshotTelnyxLegForDropLog(
                call,
                client,
                callDurationRef.current,
                callStateRef.current,
                { eventName: state }
              ),
              remainingLegIds: remaining.map((x) => x?.id).filter((id) => id != null),
            });
            lastCallUiFingerprintRef.current = '';
            const best = pickBestOutboundLeg(remaining, outboundLegArrivalMsRef.current);
            if (best) {
              currentCallRef.current = best;
              if (!best._dbCallId && outboundCallRecordIdRef.current) {
                best._dbCallId = outboundCallRecordIdRef.current;
              }
              handleCallStateChangeRef.current(best);
            }
            break;
          }

          // Only hand off to sibling legs during pre-answer races.
          // After any connected phase, sibling legs are often stale parked/ringing ghosts.
          if (outboundDialActiveRef.current && remaining.length > 0 && !hadConnectedPhase) {
            lastCallUiFingerprintRef.current = '';
            const best = pickBestOutboundLeg(remaining, outboundLegArrivalMsRef.current);
            if (best) {
              currentCallRef.current = best;
              if (!best._dbCallId && outboundCallRecordIdRef.current) {
                best._dbCallId = outboundCallRecordIdRef.current;
              }
              handleCallStateChangeRef.current(best);
              break;
            }
          }
          if (outboundDialActiveRef.current && call) {
            const fromCall = mergeHangupMetaFromTelnyx(call, null);
            lastOutboundHangupMetaRef.current = mergeHangupMetaPrefer(
              lastOutboundHangupMetaRef.current,
              fromCall
            );
          }
          logCallDropSource('sdk_leg_terminal_invoking_handleCallEnd', {
            ...snapshotTelnyxLegForDropLog(
              call,
              client,
              callDurationRef.current,
              callStateRef.current,
              { eventName: state }
            ),
          });
          handleCallEnd({
            dropSource: {
              reason: 'sdk_leg_terminal',
              eventName: state,
              call,
            },
          });
        } catch (err) {
          console.error('Error in handleCallEnd (handled):', err);
        }
        break;
      default:
        console.log('📱 Unknown call state:', state, 'raw:', rawState);
        break;
    }
    } catch (switchErr) {
      console.error('Error in call state switch (handled):', switchErr);
      if (state === 'active') {
        try {
          setCallState(CALL_STATES.ACTIVE);
        } catch (e) {
          console.error('Failed to set call state (critical):', e);
        }
      }
    }
    } catch (outerErr) {
      // Catch any errors that weren't caught by inner try-catch blocks
      console.error('Unhandled error in handleCallStateChange (handled):', outerErr);
      if (normalizeTelnyxCallState(getRawTelnyxCallState(call)) === 'active') {
        try {
          setCallState(CALL_STATES.ACTIVE);
        } catch (e) {
          // If even setting state fails, log it but don't throw
          console.error('Critical: Failed to set call state:', e);
        }
      }
    }
  }, [startDurationTimer, handleCallEnd]);

  // Handle incoming call
  const handleIncomingCallEvent = useCallback((call) => {
    if (
      shouldClearStaleOutboundSession({
        outboundDialActiveRef,
        outboundDialStartedAtRef,
        callStateRef,
        currentCallRef,
        telnyxClientRef,
      })
    ) {
      console.warn("📱 Clearing stale outbound session guard before inbound handling");
      outboundDialActiveRef.current = false;
      outboundDialStartedAtRef.current = 0;
      outboundRingbackStartedRef.current = false;
      outboundNewCallLegRef.current = null;
      outboundLegArrivalMsRef.current = {};
    }

    if (isActiveOutboundLeg(call, outboundDialActiveRef, currentCallRef)) {
      console.log('📱 Ignoring incoming handler for active outbound leg (wrong direction tag)');
      return;
    }
    if (outboundDialActiveRef.current) {
      console.log('📱 Outbound dial in progress — treating inbound-tagged leg as same session (not incoming UI)');
      if (call?.id != null && outboundLegArrivalMsRef.current[call.id] == null) {
        outboundLegArrivalMsRef.current[call.id] = Date.now();
      }
      handleCallStateChangeRef.current(call);
      return;
    }
    if (!isInboundTelnyxCall(call)) {
      console.log('📱 Ignoring non-inbound call in handleIncomingCallEvent, direction:', call?.direction);
      return;
    }
    // Prevent duplicate handling (use ref)
    if (callStateRef.current === CALL_STATES.INCOMING && currentCallRef.current === call) {
      console.log('📱 Incoming call already being handled, ignoring duplicate');
      return;
    }

    // ============================================================
    // TENANT ISOLATION GATE
    // ------------------------------------------------------------
    // All browsers in this deployment share a single set of SIP
    // credentials, so Telnyx will fork inbound INVITEs to every
    // registered client (including clients owned by OTHER tenants).
    // Before we even consider presenting an incoming-call UI, we
    // MUST confirm that the called-party number on this INVITE is
    // actually owned by the authenticated user. Failure is closed.
    // ============================================================
    const destinationNumber = extractCalledNumberFromIncomingCall(call);
    const canonicalDestination = normalizeInboundNumberStrict(destinationNumber);
    // Read from the ref — `handleIncomingCallEvent` is intentionally a stable
    // useCallback with empty deps, so we cannot rely on the React state copy.
    const credsSnapshot = latestWebrtcCredsRef.current;
    const ownedNumbers = Array.isArray(credsSnapshot?.ownedNumbers)
      ? credsSnapshot.ownedNumbers
      : [];
    const ownershipCheck = checkCalledNumberAgainstOwnedList(
      destinationNumber,
      ownedNumbers
    );
    const callControlIdForLog = call?.callControlId || call?.options?.callControlId || null;
    if (!ownershipCheck.ok) {
      logTenantSecurityClient('critical', {
        eventType: 'inbound_rejected_wrong_tenant',
        rejectionReason: ownershipCheck.reason,
        rawDestination: destinationNumber || null,
        canonicalDestination: canonicalDestination || null,
        ownedCount: ownedNumbers.length,
        callControlId: callControlIdForLog,
        userId: credsSnapshot?.userId ? String(credsSnapshot.userId) : null,
      });
      rejectIncomingCallSafely(
        call,
        `inbound_wrong_tenant:${ownershipCheck.reason}`
      );
      // Do NOT touch any incoming-call UI state — silently drop.
      return;
    }

    // Local check passed. Kick off an authoritative server check in
    // parallel; if the server contradicts the local cache (e.g. the
    // number was released mid-session) we tear the UI down.
    verifyInboundOwnershipServer({
      calledNumber: destinationNumber,
      callerNumber:
        call?.options?.remoteCallerNumber ??
        call?.options?.callerNumber ??
        null,
      callControlId: callControlIdForLog,
    })
      .then((verdict) => {
        if (verdict?.ok === true) return;
        logTenantSecurityClient('critical', {
          eventType: 'inbound_rejected_server_verify_failed',
          rejectionReason: verdict?.reason || 'server_denied_ownership',
          rawDestination: destinationNumber || null,
          canonicalDestination: canonicalDestination || verdict?.canonical || null,
          callControlId: callControlIdForLog,
          userId: credsSnapshot?.userId ? String(credsSnapshot.userId) : null,
        });
        if (currentCallRef.current === call) {
          try {
            soundManager.stopRingtone();
          } catch (_) {
            /* ignore */
          }
          if (notificationRef.current) {
            try {
              notificationRef.current.close();
            } catch (_) {
              /* ignore */
            }
            notificationRef.current = null;
          }
          setIncomingCall(null);
          setRemoteNumber('');
          setCallPhaseLabel(null);
          setCallState(CALL_STATES.IDLE);
          currentCallRef.current = null;
        }
        rejectIncomingCallSafely(
          call,
          `inbound_server_verify_failed:${verdict?.reason || 'unknown'}`
        );
      })
      .catch(() => {
        // verifyInboundOwnershipServer already fails closed; if the
        // promise itself rejects (e.g. network), fall back to safe
        // rejection.
        logTenantSecurityClient('critical', {
          eventType: 'inbound_rejected_server_verify_exception',
          rejectionReason: 'verify_promise_rejected',
          rawDestination: destinationNumber || null,
          canonicalDestination: canonicalDestination || null,
          callControlId: callControlIdForLog,
        });
        if (currentCallRef.current === call) {
          try {
            soundManager.stopRingtone();
          } catch (_) {
            /* ignore */
          }
          setIncomingCall(null);
          setRemoteNumber('');
          setCallPhaseLabel(null);
          setCallState(CALL_STATES.IDLE);
          currentCallRef.current = null;
        }
        rejectIncomingCallSafely(call, 'inbound_server_verify_exception');
      });

    logTenantSecurityClient('info', {
      eventType: 'inbound_local_ownership_accepted',
      canonicalDestination: canonicalDestination || destinationNumber || null,
      callControlId: callControlIdForLog,
      userId: credsSnapshot?.userId ? String(credsSnapshot.userId) : null,
    });

    const rawCaller =
      call.options?.remoteCallerNumber ??
      call.options?.callerNumber ??
      call.options?.caller_id_number ??
      call.remoteCallerNumber ??
      call.callerNumber ??
      call.from ??
      '';
    const trimmed = String(rawCaller || '').trim();
    if (!trimmed) {
      console.warn('📱 Ignoring incoming with no caller id (no second Unknown window)');
      return;
    }
    const tl = trimmed.toLowerCase();
    if (tl === 'unknown' || tl === 'anonymous' || tl === 'private') {
      console.warn('📱 Ignoring incoming with withheld/unknown caller label');
      return;
    }
    const callerNumber = trimmed;
    
    console.log('📱 ========== INCOMING CALL EVENT ==========');
    console.log('📱 Caller Number:', callerNumber);
    console.log('📱 Call State:', call.state);
    console.log('📱 Call Object:', call);
    console.log('📱 Call Options:', call.options);
    console.log('📱 =========================================');
    
    currentCallRef.current = call;

    setRemoteNumber(callerNumber);
    setCallState(CALL_STATES.INCOMING);
    setCallPhaseLabel('Ringing...');
    setIncomingCall(call);
    setIsMinimized(false);

    // Start ringtone once for incoming flow.
    soundManager.startRingtone();

    // Show browser notification (even if app is in background).
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          if (notificationRef.current) {
            notificationRef.current.close();
          }

          const notification = new Notification("📞 Incoming Call", {
            body: `Call from ${callerNumber}`,
            icon: "/logo.svg",
            tag: "incoming-call",
            requireInteraction: true,
            badge: "/logo.svg",
            vibrate: [200, 100, 200]
          });

          notificationRef.current = notification;

          // Keep call window visible; avoid hard navigations/reloads.
          notification.onclick = () => {
            window.focus();
            setIsMinimized(false);
            if (currentCallRef.current) {
              setCallState(CALL_STATES.INCOMING);
              setRemoteNumber(callerNumber);
              setIncomingCall(currentCallRef.current);
            }
            notification.close();
            notificationRef.current = null;
          };
        } catch (err) {
          console.warn("Failed to show notification:", err);
        }
      } else if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }

    // State updates arrive via telnyx.notification (callUpdate) — not call.on('stateChange')
  }, []); // Empty deps - use ref instead
  
  // Store stable references to callbacks - initialize immediately
  const handleCallStateChangeRef = useRef(() => {
    console.warn('handleCallStateChangeRef called before initialization');
  });
  const handleIncomingCallEventRef = useRef(() => {
    console.warn('handleIncomingCallEventRef called before initialization');
  });
  
  // Update refs whenever callbacks change
  useEffect(() => {
    handleCallStateChangeRef.current = handleCallStateChange;
  }, [handleCallStateChange]);
  
  useEffect(() => {
    handleIncomingCallEventRef.current = handleIncomingCallEvent;
  }, [handleIncomingCallEvent]);

  // Initialize Telnyx WebRTC client
  const initializeClient = useCallback(async (traceIdOpt) => {
    const traceId =
      typeof traceIdOpt === 'string' && traceIdOpt.trim()
        ? traceIdOpt.trim()
        : `webrtc-init-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Prevent multiple initializations
    if (initializationPromiseRef.current) {
      console.log('📱 Already initializing, waiting...');
      execTrace(traceId, 'initializeClient:await_existing_promise', {});
      return initializationPromiseRef.current;
    }

    // If already connected and ready, return true (use refs)
    if (telnyxClientRef.current && isClientReadyRef.current && isInitializedRef.current) {
      console.log('📱 Client already ready');
      execTrace(traceId, 'initializeClient:early_return_already_ready', {
        refReady: true,
        hasClient: true,
      });
      return true;
    }

    setIsInitializing(true);
    setError(null);
    
    initializationPromiseRef.current = (async () => {
      try {
        execTrace(traceId, 'initializeClient:fetch_token:before', {
          baseURL: import.meta.env.VITE_API_URL || '(same-origin)',
        });
        console.log('📱 Initializing Telnyx WebRTC client...');
        const tokenT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const response = await API.get('/api/webrtc/token', {
          timeout: TELECOM_HTTP_TIMEOUT_MS,
          ...traceHeaders(traceId),
        });
        const tokenMs =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tokenT0;
        console.log('[CALL FLOW] GET /api/webrtc/token done', { ms: Math.round(tokenMs), httpStatus: response.status });
        execTrace(traceId, 'initializeClient:fetch_token:after', {
          ms: Math.round(tokenMs),
          httpStatus: response.status,
          err: response.error || null,
          hasCreds: !!(response.data?.credentials && response.data.credentials.sipUsername),
          hasLoginTokenField: !!response.data?.credentials?.loginToken,
          hasSipPasswordField: !!response.data?.credentials?.sipPassword,
          viteSipPasswordEnv: !!String(import.meta.env.VITE_TELNYX_SIP_PASSWORD || '').trim(),
        });

        const httpOk =
          typeof response.status === 'number' &&
          response.status >= 200 &&
          response.status < 300;

        if (!httpOk) {
          webrtcCredentialsReadyRef.current = false;
          const msg =
            response.error ||
            response.data?.error ||
            `WebRTC token request failed (${response.status})`;
          console.error('[WEBRTC TOKEN] HTTP error:', msg, response);
          execTrace(traceId, 'initializeClient:token_http_fail', { msg });
          setError(msg);
          setIsInitializing(false);
          return false;
        }

        if (response.error && !response.data?.credentials) {
          webrtcCredentialsReadyRef.current = false;
          console.error('Failed to get WebRTC credentials:', response.error);
          execTrace(traceId, 'initializeClient:token_response_error_shape', {
            error: response.error,
          });
          setError(response.error);
          setIsInitializing(false);
          return false;
        }

        const creds = response.data?.credentials;
        if (!creds || !creds.sipUsername) {
          webrtcCredentialsReadyRef.current = false;
          console.error('Invalid credentials received', response.data);
          execTrace(traceId, 'initializeClient:invalid_creds', {});
          setError('Invalid calling credentials');
          setIsInitializing(false);
          return false;
        }

        setCredentials(creds);
        latestWebrtcCredsRef.current = creds;
        webrtcCredentialsReadyRef.current = true;
        console.log('[CALL FLOW] WebRTC credentials ref set (token OK)', {
          sipUser: creds.sipUsername,
          hasServerSipPassword: !!String(creds.sipPassword || '').trim(),
        });

        const sipPassword =
          (creds.sipPassword || import.meta.env.VITE_TELNYX_SIP_PASSWORD || '').trim();
        // Prefer SIP whenever we have a password (server or Vite). JWT only if no SIP secret anywhere.
        const loginToken = sipPassword ? null : creds.loginToken || null;
        if (!loginToken && !sipPassword) {
          webrtcCredentialsReadyRef.current = false;
          console.error(
            'Missing WebRTC auth: set TELNYX_SIP_PASSWORD or VITE_TELNYX_SIP_PASSWORD, or enable server JWT (telephony credential)'
          );
          setError('Calling password not configured');
          execTrace(traceId, 'initializeClient:missing_password_and_jwt', {});
          syncClientReady(false);
          setIsInitializing(false);
          isInitializedRef.current = false;
          return false;
        }

        execTrace(traceId, 'initializeClient:auth_mode', {
          mode: loginToken ? 'login_token' : 'sip_password',
        });
        console.log(
          loginToken
            ? '📱 Creating TelnyxRTC client with login_token (JWT)'
            : '📱 Creating TelnyxRTC client with SIP login:',
          loginToken ? '(minted)' : creds.sipUsername
        );

        // Disconnect existing client if any
        if (telnyxClientRef.current) {
          try {
            telnyxClientRef.current.disconnect();
          } catch (e) {
            console.error('Telnyx client disconnect error:', e);
          }
          telnyxClientRef.current = null;
        }

        const { TelnyxRTC } = await import('@telnyx/webrtc');
        // Create new Telnyx WebRTC client (SDK chunk loads only when dialing stack initializes)
        const client = loginToken
          ? new TelnyxRTC({
              login_token: loginToken,
              ringtoneFile: null,
              ringbackFile: null,
            })
          : new TelnyxRTC({
              login: creds.sipUsername,
              password: sipPassword,
              ringtoneFile: null,
              ringbackFile: null,
            });

        // Store reference immediately
        telnyxClientRef.current = client;
        // Required for SDK to attach remote MediaStream to your <audio> (see Telnyx README)
        client.remoteElement = TELNYX_REMOTE_AUDIO_ID;

        const logTelnyxSdkEvent = (eventName, detail) => {
          try {
            console.log('[TELNYX SDK]', eventName, detail === undefined ? '' : detail);
          } catch (_) {
            /* ignore */
          }
        };

        // Promise to wait for ready
        const readyPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            execTrace(traceId, 'initializeClient:ready_timeout_45s', {});
            reject(new Error('Connection timeout - please check your credentials'));
          }, 45000);

          client.on('telnyx.ready', () => {
            clearTimeout(timeout);
            logTelnyxSdkEvent('telnyx.ready', { connected: client?.connected });
            console.log('✅ Telnyx WebRTC client ready!');
            execTrace(traceId, 'initializeClient:telnyx.ready', {});
            try {
              if (callStateRef.current !== CALL_STATES.IDLE) {
                setCallPhaseLabel(null);
              }
            } catch (_) {
              /* ignore */
            }
            syncClientReady(true);
            setError(null);
            setIsInitializing(false);
            isInitializedRef.current = true;
            resolve(true);
          });

          client.on('telnyx.error', (err) => {
            clearTimeout(timeout);
            logTelnyxSdkEvent('telnyx.error', err);
            console.error('❌ Telnyx error:', err);
            execTrace(traceId, 'initializeClient:telnyx.error', {
              message: err?.message,
              stack: err?.stack,
            });
            setError(err.message || 'Connection error');
            syncClientReady(false);
            setIsInitializing(false);
            reject(err);
          });
        });

        client.on('telnyx.rtcError', (rtcErr) => {
          logTelnyxSdkEvent('telnyx.rtcError', rtcErr);
          execTrace(traceId, 'initializeClient:telnyx.rtcError', {
            detail: rtcErr?.message || String(rtcErr),
          });
        });

        client.on('telnyx.socket.close', () => {
          logTelnyxSdkEvent('telnyx.socket.close', { connected: client?.connected });
          const cs = callStateRef.current;
          if (
            cs === CALL_STATES.ACTIVE ||
            cs === CALL_STATES.RINGING ||
            cs === CALL_STATES.CONNECTING ||
            cs === CALL_STATES.DIALING ||
            cs === CALL_STATES.HELD
          ) {
            try {
              setCallPhaseLabel('Reconnecting...');
            } catch (_) {
              /* ignore */
            }
          }
          telecomStructuredLog('[WS FLOW]', {
            sourcePath: 'CallContext.jsx:telnyx.socket.close',
            eventType: 'telnyx_socket_close',
            callId: outboundCallRecordIdRef.current
              ? String(outboundCallRecordIdRef.current)
              : null,
            userId: null,
            callControlId: currentCallRef.current?.callControlId || null,
            currentStatus: callStateRef.current,
          });
          execTrace(traceId, 'initializeClient:telnyx.socket.close', {});
          syncClientReady(false);
          isInitializedRef.current = false;

          // Never start a second full init while user is placing or on a call — it disconnect()s the client.
          setTimeout(() => {
            if (outboundDialActiveRef.current) {
              console.warn(
                '📱 Skipping WebRTC auto-reconnect during outbound call setup/session'
              );
              return;
            }
            if (callStateRef.current !== CALL_STATES.IDLE) {
              console.warn(
                '📱 Skipping WebRTC auto-reconnect — call UI not idle:',
                callStateRef.current
              );
              return;
            }
            if (!isClientReadyRef.current && !isInitializingRef.current) {
              console.log('📱 Attempting to reconnect WebRTC client...');
              initializeClient().catch((e) => {
                console.log('📱 Reconnection failed:', e.message);
              });
            }
          }, 3000);
        });
        
        // Monitor connection health
        client.on('telnyx.socket.open', () => {
          logTelnyxSdkEvent('telnyx.socket.open', { connected: client?.connected });
          try {
            if (callStateRef.current === CALL_STATES.ACTIVE) {
              setCallPhaseLabel(null);
            } else if (callStateRef.current !== CALL_STATES.IDLE) {
              setCallPhaseLabel(null);
            }
          } catch (_) {
            /* ignore */
          }
          console.log('📱 Telnyx socket opened - connection active');
          execTrace(traceId, 'initializeClient:telnyx.socket.open', {});
          telecomStructuredLog('[WS FLOW]', {
            sourcePath: 'CallContext.jsx:telnyx.socket.open',
            eventType: 'telnyx_socket_open',
            callId: outboundCallRecordIdRef.current
              ? String(outboundCallRecordIdRef.current)
              : null,
            userId: null,
            callControlId: currentCallRef.current?.callControlId || null,
            currentStatus: callStateRef.current,
          });
        });

        client.on('telnyx.socket.error', (socketErr) => {
          logTelnyxSdkEvent('telnyx.socket.error', socketErr);
          console.error('📱 Telnyx socket error:', socketErr);
          execTrace(traceId, 'initializeClient:telnyx.socket.error', {
            detail: socketErr?.message || String(socketErr),
          });
          telecomStructuredLog('[WS FLOW]', {
            sourcePath: 'CallContext.jsx:telnyx.socket.error',
            eventType: 'telnyx_socket_error',
            callId: outboundCallRecordIdRef.current
              ? String(outboundCallRecordIdRef.current)
              : null,
            userId: null,
            callControlId: currentCallRef.current?.callControlId || null,
            currentStatus: callStateRef.current,
          });
        });

        client.on('telnyx.rtc.mediaError', (mediaErr) => {
          logTelnyxSdkEvent('telnyx.rtc.mediaError', mediaErr);
          console.error('📱 Telnyx rtc.mediaError:', mediaErr);
          execTrace(traceId, 'initializeClient:telnyx.rtc.mediaError', {
            detail: mediaErr?.message || String(mediaErr),
          });
        });

        client.on('telnyx.rtc.peerConnectionFailureError', (pcErr) => {
          logTelnyxSdkEvent('telnyx.rtc.peerConnectionFailureError', pcErr);
          console.error('📱 Telnyx peerConnectionFailureError:', pcErr);
          execTrace(traceId, 'initializeClient:telnyx.rtc.peerConnectionFailureError', {
            detail: pcErr?.message || String(pcErr),
          });
        });

        client.on('telnyx.rtc.incoming', (call) => {
          logTelnyxSdkEvent('telnyx.rtc.incoming', { id: call?.id, direction: call?.direction });
          console.log('📱 telnyx.rtc.incoming:', call);
          handleIncomingCallEventRef.current(call);
        });

        client.on('telnyx.notification', (notification) => {
          logTelnyxSdkEvent('telnyx.notification', {
            type: notification?.type,
            hasCall: !!notification?.call,
          });
          const call = notification?.call;
          const type = notification?.type;
          // callUpdate is how @telnyx/webrtc signals state changes — there is no call.on('stateChange')
          const isCallUpdate =
            type === 'callUpdate' ||
            type === 'verticast.callUpdate' ||
            String(type || '').endsWith('callUpdate');
          if (call && isCallUpdate) {
            handleCallStateChangeRef.current(call);
          }
          if (type === 'incomingCall' && call) {
            if (outboundDialActiveRef.current) {
              handleCallStateChangeRef.current(call);
            } else {
              handleIncomingCallEventRef.current(call);
            }
          }
          if (type === 'userMediaError') {
            const msg = notification.errorMessage || notification.error?.message || 'Microphone permission or device error';
            console.error('📱 Telnyx userMediaError:', notification);
            setError(msg);
          }
        });

        // Outbound PSTN legs are often mis-tagged inbound — use isInboundIncomingForUi (same as handleCallStateChange).
        client.on('call', (call) => {
          if (!call) return;
          logTelnyxSdkEvent('call', { id: call?.id, direction: call?.direction });
          if (outboundDialActiveRef.current && call.id != null && outboundLegArrivalMsRef.current[call.id] == null) {
            outboundLegArrivalMsRef.current[call.id] = Date.now();
          }
          console.log('📱 client call event:', call.direction, normalizeTelnyxCallState(getRawTelnyxCallState(call)));
          if (isInboundIncomingForUi(call, outboundDialActiveRef, currentCallRef)) {
            handleIncomingCallEventRef.current(call);
          } else {
            handleCallStateChangeRef.current(call);
          }
        });

        client.on('incoming', (call) => {
          logTelnyxSdkEvent('incoming', { id: call?.id });
          handleIncomingCallEventRef.current(call);
        });

        // Connect to Telnyx
        console.log('📱 Connecting to Telnyx...');
        console.log('📱 SIP Username:', creds.sipUsername);
        console.log('📱 Connection ID:', creds.connectionId);

        execTrace(traceId, 'initializeClient:connect:before', {});
        await client.connect();
        execTrace(traceId, 'initializeClient:connect:after_await', {
          clientConnectedFlag: client.connected,
        });

        // Wait for ready
        await readyPromise;

        execTrace(traceId, 'initializeClient:readyPromise:resolved', {
          refReady: isClientReadyRef.current,
          isInitialized: isInitializedRef.current,
        });

        console.log('✅ Telnyx client connected and ready');
        console.log('✅ Client is now listening for incoming calls');
        console.log('✅ Make sure your phone number has connection_id set to:', creds.connectionId);
        
        // Verify connection by checking client state
        if (client.connected !== undefined) {
          console.log('📱 Client connection state:', client.connected);
        }
        
        return true;
      } catch (err) {
        console.error('Failed to initialize Telnyx client:', err);
        execTrace(traceId, 'initializeClient:catch', {
          message: err?.message,
          stack: err?.stack,
        });
        setError(err.message || 'Failed to connect to calling service');
        setIsInitializing(false);
        syncClientReady(false);
        isInitializedRef.current = false;
        return false;
      } finally {
        initializationPromiseRef.current = null;
      }
    })();

    return initializationPromiseRef.current;
  }, [syncClientReady]);

  // Save call record to database
  const saveCallRecord = useCallback(async (
    toNumber,
    fromNumber,
    direction = 'outbound',
    status = 'initiated',
    execTraceId = null
  ) => {
    const payload = {
      phoneNumber: toNumber,
      fromNumber: fromNumber,
      toNumber: toNumber,
      direction,
      status,
      source: 'webrtc',
    };
    console.log('[CALL FLOW] Sending request to /api/calls', {
      destinationNumber: toNumber,
      callerNumber: fromNumber,
      payload,
    });

    const response = await API.post('/api/calls', payload, {
      timeout: TELECOM_HTTP_TIMEOUT_MS,
      ...traceHeaders(execTraceId),
    });

    console.log('[CALL FLOW] Response from /api/calls', {
      status: response.status,
      error: response.error,
      data: response.data,
      full: response,
    });

    const httpFail =
      typeof response.status === 'number' && response.status >= 400;
    const callDoc = response.data?.call;
    const callId = callDoc?._id || callDoc?.id;

    if (response.status === 409) {
      const msg = response.data?.error || response.error || 'Call already in progress';
      console.error('[CALL ERROR FRONTEND] POST /api/calls 409', response.response || response);
      console.warn('[CALL FLOW] CREATE rejected (409):', msg);
      return { ok: false, error: msg };
    }
    if (httpFail || response.error || !callId) {
      const msg =
        response.data?.error ||
        response.error ||
        'Failed to create call';
      console.error('[CALL ERROR FRONTEND] POST /api/calls failed', {
        msg,
        httpFail,
        axiosShape: response.response || response,
      });
      console.warn('[CALL FLOW] CREATE CALL FAILED', { httpFail, msg, response });
      return { ok: false, error: msg };
    }
    console.log('[CALL FLOW] CALL CREATED (DB)', { callId });
    return { ok: true, callId };
  }, []);

  // Update call record in database
  const updateCallRecord = useCallback(async (callId, updates) => {
    if (!callId) return;
    try {
      await API.patch(`/api/calls/${callId}`, updates);
      console.log('📱 Call record updated:', callId, updates);
    } catch (err) {
      console.error('📱 Failed to update call record:', err);
      throw err;
    }
  }, []);

  const ensureMicrophonePermission = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      console.warn("📱 Microphone access unavailable:", err);
      const permissionMessage =
        err?.name === "NotAllowedError" || err?.name === "SecurityError"
          ? "Microphone access is blocked. Please allow microphone permission and try again."
          : "Microphone is unavailable. Please check your audio settings and try again.";
      setError(permissionMessage);
      return false;
    }
  }, []);

  const fixPhoneConfiguration = useCallback(async () => {
    const now = Date.now();
    const recentlyFixed =
      hasAttemptedPhoneConfigFixRef.current &&
      now - lastPhoneConfigFixAtRef.current < 5 * 60 * 1000;
    if (recentlyFixed) {
      return true;
    }

    lastPhoneConfigFixAtRef.current = now;

    try {
      const voiceResponse = await API.post("/api/numbers/fix-voice", {}, {
        timeout: TELECOM_HTTP_TIMEOUT_MS,
      });
      if (voiceResponse?.error) {
        throw new Error(voiceResponse.error);
      }
      hasAttemptedPhoneConfigFixRef.current = true;
      console.log("📱 Voice connection sync completed");
      return true;
    } catch (voiceErr) {
      // Fallback to full repair path for environments that only expose fix-all.
      try {
        const fullResponse = await API.post("/api/numbers/fix-all", {}, {
          timeout: TELECOM_HTTP_TIMEOUT_MS,
        });
        if (fullResponse?.error) {
          throw new Error(fullResponse.error);
        }
        hasAttemptedPhoneConfigFixRef.current = true;
        console.log("📱 Full Telnyx configuration sync completed");
        return true;
      } catch (fullErr) {
        hasAttemptedPhoneConfigFixRef.current = false;
        console.warn(
          "📱 Phone configuration sync failed:",
          fullErr?.message || voiceErr?.message || fullErr || voiceErr
        );
        return false;
      }
    }
  }, []);

  // Make outbound call
  const makeCall = useCallback(async (destinationNumber, callerIdNumber) => {
    const traceId = `dial-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    execTrace(traceId, 'makeCall:entry', {
      destinationNumber,
      callerIdNumber,
      refReady: isClientReadyRef.current,
      hasClient: !!telnyxClientRef.current,
      callUiState: callStateRef.current,
      viteApiUrl: import.meta.env.VITE_API_URL || '(empty,same-origin)',
    });
    console.log('[CALL FLOW] CALL BUTTON / makeCall', { traceId, destinationNumber, callerIdNumber });
    console.log('📱 Current state:', {
      isClientReadyState: isClientReady,
      refReady: isClientReadyRef.current,
      hasClient: !!telnyxClientRef.current,
      callState: callStateRef.current,
    });

    try {
      setError(null);
      webRtcDbSyncRef.current = { ringing: false, active: false, terminal: false };
      outboundRingbackStartedRef.current = false;
      lastOutboundHangupMetaRef.current = null;
      setRemoteNumber(destinationNumber);
      setIsMinimized(false);

      let callerId = callerIdNumber;
      const credsSnapshot = latestWebrtcCredsRef.current || credentials;
      if (!callerId && credsSnapshot?.callerIdNumber) {
        callerId = credsSnapshot.callerIdNumber;
      }

      if (!callerId) {
        throw new Error('No caller ID available. Please purchase a phone number first.');
      }

      const destE164 = toOutboundDestinationE164(destinationNumber);
      if (!destE164) {
        throw new Error(
          'Invalid destination number. Use E.164 (e.g. +16465550100). For +1 (US/Canada) use exactly 10 digits after +1.'
        );
      }
      const callerE164 = normalizeDialNumber(callerId);
      if (!callerE164) {
        throw new Error('Invalid caller number');
      }
      if (
        !String(callerE164).toLowerCase().startsWith('sip:') &&
        !validateE164(callerE164)
      ) {
        throw new Error('Invalid caller number format (E.164 required)');
      }

      console.log('[CALL DEBUG] Destination:', destE164);
      console.log('[CALL DEBUG] Caller ID:', callerE164);
      console.log('[CALL DEBUG] SIP User:', credsSnapshot?.sipUsername);

      console.log('[CALL FLOW] Dial path: WebRTC newCall first; POST /api/calls + repair async after leg exists', {
        callMinimalClient: isCallMinimalClient,
      });

      setCallState(CALL_STATES.DIALING);
      setCallPhaseLabel('Connecting...');

      if (!telnyxClientRef.current || !isClientReadyRef.current) {
        console.log('📱 Client not ready, initializing before newCall...');
        execTrace(traceId, 'makeCall:before_initializeClient_on_demand', {
          hasClient: !!telnyxClientRef.current,
          refReady: isClientReadyRef.current,
        });
        const initialized = await initializeClient(traceId);
        console.log('📱 Initialization result:', initialized);
        execTrace(traceId, 'makeCall:after_initializeClient_on_demand', {
          initialized,
          refReady: isClientReadyRef.current,
          hasClient: !!telnyxClientRef.current,
        });
        if (!initialized) {
          throw new Error('Failed to connect to calling service. Please try again.');
        }
        await new Promise((resolve) => setTimeout(resolve, isCallMinimalClient ? 50 : 150));
      }

      if (!telnyxClientRef.current) {
        execTrace(traceId, 'makeCall:guard_fail_no_client_ref', {});
        throw new Error('Calling service not available');
      }
      if (!isClientReadyRef.current) {
        execTrace(traceId, 'makeCall:guard_fail_not_ready_ref', {});
        throw new Error('Telnyx client not ready');
      }

      execTrace(traceId, 'makeCall:before_getUserMedia', {});
      const micOk = await ensureMicrophonePermission();
      execTrace(traceId, 'makeCall:after_getUserMedia', { micOk });
      if (!micOk) {
        throw new Error(
          'Microphone is required to place a call. Allow access and try again.'
        );
      }

      let callRecordId = null;

      console.log('[CALL FLOW] WebRTC newCall next', { from: callerE164, to: destE164 });

      execTrace(traceId, 'makeCall:before_SDK_newCall', {
        destinationNumber: destE164,
        callerNumber: callerE164,
        hasParkClientState: false,
        sdkCallsKeys:
          telnyxClientRef.current?.calls &&
          typeof telnyxClientRef.current.calls === 'object'
            ? Object.keys(telnyxClientRef.current.calls).length
            : null,
      });

      console.log('[CALL EXECUTION] before_newCall', {
        traceId,
        destE164,
        callerE164,
        refReady: isClientReadyRef.current,
        webrtcCredsRef: webrtcCredentialsReadyRef.current,
      });

      // Per-call onNotification: first handler on call id so UI updates even if session handler misses
      const call = telnyxClientRef.current.newCall({
        destinationNumber: destE164,
        callerNumber: callerE164,
        audio: true,
        video: false,
        screenShare: false,
        remoteElement: TELNYX_REMOTE_AUDIO_ID,
        onNotification: (notification) => {
          const t = notification?.type;
          const isCallUpdate =
            t === 'callUpdate' ||
            t === 'verticast.callUpdate' ||
            String(t || '').endsWith('callUpdate');
          if (notification?.call && isCallUpdate) {
            handleCallStateChangeRef.current(notification.call);
          }
          if (notification?.type === 'userMediaError') {
            const msg =
              notification.errorMessage || notification.error?.message || 'Microphone permission or device error';
            console.error('📱 Outbound userMediaError:', notification);
            setError(msg);
          }
        },
      });

      if (!call) {
        console.error('[CALL EXECUTION] newCall_failed', { traceId, reason: 'null_leg' });
      } else {
        console.log('[CALL EXECUTION] after_newCall', { traceId, legId: call.id });
      }

      execTrace(traceId, 'makeCall:after_SDK_newCall', {
        hasCall: !!call,
        legId: call?.id ?? null,
      });

      if (!call) {
        execTrace(traceId, 'makeCall:newCall_returned_null', { callRecordId: callRecordId || null });
        outboundDialActiveRef.current = false;
        setError('Failed to create call');
        setCallState(CALL_STATES.IDLE);
        if (callRecordId) {
          void API.patch(`/api/calls/${callRecordId}`, {
            status: 'failed',
            hangupCause: 'telnyx_newCall_returned_null',
          }).catch((pe) =>
            console.error('[CALL ERROR FRONTEND] PATCH newCall null:', pe?.response || pe)
          );
        }
        outboundCallRecordIdRef.current = null;
        resetOutboundRetryState();
        return false;
      }

      outboundDialActiveRef.current = true;
      outboundDialStartedAtRef.current = Date.now();
      currentCallRef.current = call;
      outboundNewCallLegRef.current = call;
      outboundLegArrivalMsRef.current = { [call.id]: Date.now() };
      call._dbCallId = callRecordId;
      call._usedDefaultCallerFallback = false;

      console.log("[WEBRTC] CALL INIT", { callId: callRecordId, legId: call.id });
      if (typeof call.on === "function") {
        try {
          call.on("error", (err) => {
            console.error("[TELNYX ERROR]", err);
            lastOutboundHangupMetaRef.current = {
              cause:
                err?.message ||
                err?.cause ||
                String(err || "CALL_ERROR"),
              causeCode: err?.causeCode ?? err?.code ?? null,
            };
            setError(
              `Call failed: ${lastOutboundHangupMetaRef.current.cause}`
            );
          });
        } catch (regErr) {
          console.warn("[WEBRTC] call.on(error) not available:", regErr);
        }
        try {
          call.on("hangup", (event) => {
            console.log("[CALL HANGUP EVENT]", event);
            const c = event?.cause ?? event?.hangup_cause;
            const cc = event?.cause_code ?? event?.causeCode;
            console.log("[CALL HANGUP EVENT] hangup.cause:", c, "hangup.cause_code:", cc);
            logCallDropSource('telnyx_call_on_hangup', {
              ...snapshotTelnyxLegForDropLog(
                call,
                telnyxClientRef.current,
                callDurationRef.current,
                callStateRef.current,
                {
                  eventName: 'call.on(hangup)',
                  hangupCause: c ?? null,
                  hangupCauseCode: cc ?? null,
                }
              ),
            });
            lastOutboundHangupMetaRef.current = mergeHangupMetaPrefer(
              lastOutboundHangupMetaRef.current,
              mergeHangupMetaFromTelnyx(call, event)
            );
            handleCallStateChangeRef.current(call);
          });
        } catch (regErr) {
          console.warn("[WEBRTC] call.on(hangup) not available:", regErr);
        }
        for (const ev of [
          'trying',
          'early',
          'ringing',
          'active',
          'recovering',
          'destroy',
        ]) {
          try {
            call.on(ev, () => {
              console.log(`[WEBRTC] ${String(ev).toUpperCase()} (event)`);
              handleCallStateChangeRef.current(call);
            });
          } catch (_) {
            /* SDK may not support all event names */
          }
        }
      }

      void (async () => {
        try {
          execTrace(traceId, 'persist:after_newCall:start', {});
          const saved = await saveCallRecord(
            destE164,
            callerE164,
            'outbound',
            'initiated',
            traceId
          );
          execTrace(traceId, 'persist:after_newCall:saveCallRecord', {
            ok: saved.ok,
            callId: saved.callId || null,
            err: saved.error || null,
          });
          if (!saved.ok) {
            console.error('[CALL EXECUTION] persist_after_newCall_failed', saved);
            safeHangupTelnyxCall(currentCallRef.current);
            outboundDialActiveRef.current = false;
            outboundCallRecordIdRef.current = null;
            setError(saved.error || 'Could not register call — disconnected');
            setCallState(CALL_STATES.IDLE);
            setCallPhaseLabel(null);
            resetOutboundRetryState();
            return;
          }
          const id = saved.callId;
          callRecordId = id;
          outboundCallRecordIdRef.current = id;
          call._dbCallId = id;
          console.log('[CALL FLOW] CALL CREATED (DB async)', { callId: id, legId: call.id });

          if (isCallMinimalClient) {
            console.log('[CALL FLOW] VITE_CALL_MINIMAL_MODE: skipped repair-outbound');
            return;
          }
          try {
            const repair = await API.post(
              '/api/webrtc/repair-outbound',
              {
                destinationNumber: destE164,
                callerNumber: callerE164,
                forceSyncCallerConnectionId: true,
              },
              { timeout: TELECOM_HTTP_TIMEOUT_MS, ...traceHeaders(traceId) }
            );
            const ok =
              typeof repair.status === 'number' &&
              repair.status >= 200 &&
              repair.status < 300 &&
              !repair.error;
            if (!ok) {
              console.warn('[CALL FLOW] repair-outbound background failed (non-blocking)', repair);
            } else if (repair.data?.parkOutboundEnabled && !repair.data?.voiceWebhookUrl) {
              console.warn(
                '[CALL FLOW] repair-outbound: park outbound without voice webhook (non-blocking)',
                repair.data
              );
            } else {
              console.log('[CALL FLOW] repair-outbound background ok');
            }
          } catch (re) {
            console.warn(
              '[CALL FLOW] repair-outbound background error (non-blocking)',
              re?.message || re
            );
          }
        } catch (e) {
          console.error('[CALL EXECUTION] persist_after_newCall_throw', e);
          safeHangupTelnyxCall(currentCallRef.current);
          outboundDialActiveRef.current = false;
          outboundCallRecordIdRef.current = null;
          setError(e?.message || 'Call registration failed');
          setCallState(CALL_STATES.IDLE);
          setCallPhaseLabel(null);
          resetOutboundRetryState();
        }
      })();

      if (sdkCallStatePollRef.current != null) {
        clearInterval(sdkCallStatePollRef.current);
        sdkCallStatePollRef.current = null;
      }
      sdkCallStatePollRef.current = window.setInterval(() => {
        const client = telnyxClientRef.current;
        const callsMap = client?.calls;
        let c = currentCallRef.current;

        if (outboundDialActiveRef.current && callsMap) {
          const list = Object.values(callsMap).filter(Boolean);
          if (list.length === 0) {
            if (sdkCallStatePollRef.current != null) {
              clearInterval(sdkCallStatePollRef.current);
              sdkCallStatePollRef.current = null;
            }
            return;
          }
          const activeList = list.filter((x) => !isTelnyxTerminalCall(x));
          const pickFrom = activeList.length > 0 ? activeList : list;
          c = pickBestOutboundLeg(pickFrom, outboundLegArrivalMsRef.current);

          if (
            c &&
            !userEndedFullCallRef.current &&
            outboundNewCallLegRef.current &&
            outboundNewCallLegRef.current !== c &&
            !isTelnyxTerminalCall(outboundNewCallLegRef.current)
          ) {
            const cr = getTelnyxCallRank(c);
            const pr = getTelnyxCallRank(outboundNewCallLegRef.current);
            const map = outboundLegArrivalMsRef.current;
            const newer = (map[c.id] ?? 0) > (map[outboundNewCallLegRef.current.id] ?? 0);
            const shouldAdopt =
              cr > pr ||
              (cr === pr && isInboundTelnyxCall(c) && !isInboundTelnyxCall(outboundNewCallLegRef.current)) ||
              (cr === pr && isInboundTelnyxCall(c) === isInboundTelnyxCall(outboundNewCallLegRef.current) && newer);
            if (shouldAdopt) {
              console.log('[CALL FLOW] Adopting better outbound leg for UI (no hangup on sibling leg)');
              outboundNewCallLegRef.current = c;
            }
          }
        }

        if (!c) {
          if (sdkCallStatePollRef.current != null) {
            clearInterval(sdkCallStatePollRef.current);
            sdkCallStatePollRef.current = null;
          }
          return;
        }
        handleCallStateChangeRef.current(c);
      }, 320);

      handleCallStateChangeRef.current(call);
      execTrace(traceId, 'makeCall:success_return_true', {
        legId: call.id,
        dbCallId: callRecordId || null,
      });
      return true;
    } catch (err) {
      console.error('[CALL ERROR FRONTEND] makeCall', err?.response || err);
      console.error('📱 Failed to make call:', err);
      execTrace(traceId, 'makeCall:catch', {
        message: err?.message,
        stack: err?.stack,
        name: err?.name,
      });
      const recordIdToFail = outboundCallRecordIdRef.current;
      const liveLeg = currentCallRef.current;
      if (liveLeg) {
        safeHangupTelnyxCall(liveLeg);
      }
      outboundDialActiveRef.current = false;
      outboundDialStartedAtRef.current = 0;
      outboundNewCallLegRef.current = null;
      outboundLegArrivalMsRef.current = {};
      setError(`Call connection failed: ${err.message || 'Failed to initiate call'}`);
      setCallState(CALL_STATES.IDLE);
      if (recordIdToFail) {
        void API.patch(`/api/calls/${recordIdToFail}`, {
          status: 'failed',
          hangupCause: err?.message || 'client_error_before_media',
        }).catch((pe) => {
          console.error(
            '[CALL ERROR FRONTEND] PATCH failed-call after error:',
            pe?.response || pe
          );
        });
      }
      outboundCallRecordIdRef.current = null;
      resetOutboundRetryState();
      return false;
    }
  }, [
    startDurationTimer,
    handleCallEnd,
    initializeClient,
    credentials,
    saveCallRecord,
    ensureMicrophonePermission,
    fixPhoneConfiguration,
    resetOutboundRetryState
  ]); // Removed frequently changing deps

  const hangupAllSessionCalls = useCallback(() => {
    const client = telnyxClientRef.current;
    if (!client?.calls) return;
    for (const leg of Object.values(client.calls)) {
      if (!leg) continue;
      try {
        const raw = normalizeTelnyxCallState(getRawTelnyxCallState(leg));
        if (raw === 'hangup' || raw === 'destroy' || raw === 'purge') continue;
        leg.hangup();
      } catch (e) {
        console.warn('📱 hangup leg (non-critical):', e);
      }
    }
  }, []);

  // Answer incoming call
  const answerCall = useCallback(async () => {
    try {
      console.log('📱 Answering call...');
      
      // Stop ringtone safely
      try {
        soundManager.stopRingtone();
      } catch (soundErr) {
        console.warn('Error stopping ringtone (non-critical):', soundErr);
      }
      
      // Close notification if it exists
      try {
        if (notificationRef.current) {
          notificationRef.current.close();
          notificationRef.current = null;
        }
      } catch (notifErr) {
        console.warn('Error closing notification (non-critical):', notifErr);
      }
      
      // Ensure call is not minimized
      setIsMinimized(false);
      
      // Get call record ID (for Voice API, this is from polling)
      let callRecordId = polledCallIdRef.current;
      
      // If we don't have a polled call ID, try to find it
      if (!callRecordId) {
        try {
          const callsResponse = await API.get('/api/calls?status=ringing&direction=inbound&limit=1');
          if (callsResponse.data?.calls && callsResponse.data.calls.length > 0) {
            callRecordId = callsResponse.data.calls[0].id || callsResponse.data.calls[0]._id;
          }
        } catch (fetchErr) {
          console.warn('Failed to fetch call record (non-critical):', fetchErr);
        }
      }
      
      // For Voice API: Answer via Call Control API endpoint
      if (callRecordId) {
        try {
          console.log('📱 Answering call via Voice API Call Control:', callRecordId);
          const answerResponse = await API.post(`/api/calls/${callRecordId}/answer`);
          if (answerResponse.data?.success) {
            console.log('✅ Call answered via Voice API Call Control');
            polledCallIdRef.current = null; // Clear after use
          }
        } catch (answerErr) {
          console.error('📱 Failed to answer via Call Control API:', answerErr);
        }
      }
      
      // Try to answer via WebRTC if call object exists (for SIP trunking)
      if (currentCallRef.current) {
        try {
          currentCallRef.current.answer();
          console.log('📱 Call answered via WebRTC');
        } catch (e) {
          console.warn('📱 WebRTC answer failed (may be Voice API call):', e);
        }
      }
      
      // Set call state and start timer
      setIncomingCall(null);
      setCallState(CALL_STATES.ACTIVE);
      
      // Start duration timer safely
      try {
        startDurationTimer();
      } catch (timerErr) {
        console.warn('Error starting duration timer (non-critical):', timerErr);
      }
      
      console.log('✅ Call answered successfully');
    } catch (err) {
      // Catch any unexpected errors
      console.error('Error in answerCall (handled):', err);
      // Still try to set state to active
      try {
        setIncomingCall(null);
        setCallState(CALL_STATES.ACTIVE);
      } catch (stateErr) {
        console.error('Critical: Failed to set call state:', stateErr);
      }
    }
  }, [startDurationTimer]);

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    console.log('📱 Rejecting call...');
    userEndedFullCallRef.current = true;
    lastOutboundHangupMetaRef.current = {
      cause: 'NORMAL_CLEARING',
      causeCode: null,
    };
    soundManager.stopRingtone();
    manualHangupRef.current = true;
    
    // Close notification if it exists
    if (notificationRef.current) {
      notificationRef.current.close();
      notificationRef.current = null;
    }
    
    hangupAllSessionCalls();

    try {
      let callRecordId = polledCallIdRef.current;
      if (!callRecordId) {
        const callsResponse = await API.get('/api/calls?status=ringing&direction=inbound&limit=1');
        if (callsResponse.data?.calls && callsResponse.data.calls.length > 0) {
          callRecordId = callsResponse.data.calls[0].id || callsResponse.data.calls[0]._id;
        }
      }
      if (callRecordId) {
        await API.post('/api/dialer/hangup', { callId: String(callRecordId) });
        polledCallIdRef.current = null;
      }
    } catch (e) {
      console.warn('📱 Inbound reject hangup:', e);
    }

    handleCallEnd({
      dropSource: { reason: 'user_reject_incoming', eventName: 'rejectCall' },
    });
  }, [handleCallEnd, hangupAllSessionCalls]);

  // Hang up current call
  const hangUp = useCallback(() => {
    console.log('📱 Hanging up...');
    userEndedFullCallRef.current = true;
    lastOutboundHangupMetaRef.current = {
      cause: 'NORMAL_CLEARING',
      causeCode: null,
    };
    hangupAllSessionCalls();
    handleCallEnd({
      dropSource: { reason: 'user_hangup', eventName: 'hangUp' },
    });
  }, [handleCallEnd, hangupAllSessionCalls]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (currentCallRef.current) {
      try {
        if (isMuted) {
          currentCallRef.current.unmuteAudio();
        } else {
          currentCallRef.current.muteAudio();
        }
        setIsMuted(!isMuted);
      } catch (e) {
        console.error('Mute toggle failed:', e);
      }
    }
  }, [isMuted]);

  // Toggle hold
  const toggleHold = useCallback(() => {
    if (currentCallRef.current) {
      try {
        if (isOnHold) {
          currentCallRef.current.unhold();
        } else {
          currentCallRef.current.hold();
        }
        setIsOnHold(!isOnHold);
      } catch (e) {
        console.error('Hold toggle failed:', e);
      }
    }
  }, [isOnHold]);

  // Helper function to apply audio routing - simplified to prevent errors
  const applyAudioRouting = useCallback((audioElement, speakerOn) => {
    if (!audioElement) {
      return;
    }
    
    // Use a simple approach that works on all devices
    try {
      if (speakerOn) {
        // Speaker mode - route to speaker
        // Remove playsinline to allow speaker output
        audioElement.removeAttribute('playsinline');
        if (audioElement.playsInline !== undefined) {
          audioElement.playsInline = false;
        }
        audioElement.volume = 1.0;
        console.log('📱 Audio set to speaker mode');
      } else {
        // Earpiece mode - route to earpiece (default on mobile)
        // Set playsinline='true' to force earpiece on mobile
        audioElement.setAttribute('playsinline', 'true');
        if (audioElement.playsInline !== undefined) {
          audioElement.playsInline = true;
        }
        // Lower volume for earpiece
        audioElement.volume = 0.8;
        console.log('📱 Audio set to earpiece mode');
      }
      
      // Ensure audio element is properly configured
      audioElement.autoplay = true;
      
      // Try to play audio if stream is available (with error handling)
      if (audioElement.srcObject) {
        const playPromise = audioElement.play();
        if (playPromise !== undefined) {
          playPromise.catch((playErr) => {
            console.error('Audio play after routing:', playErr);
          });
        }
      }
    } catch (err) {
      // Silently handle any errors to prevent ErrorBoundary from catching them
      console.warn('Audio routing error (handled):', err);
    }
  }, []);

  // Update applyAudioRoutingRef whenever applyAudioRouting changes
  useEffect(() => {
    applyAudioRoutingRef.current = applyAudioRouting;
  }, [applyAudioRouting]);

  // Toggle speaker - actually control audio output
  const toggleSpeaker = useCallback(() => {
    const newSpeakerState = !isSpeaker;
    setIsSpeaker(newSpeakerState);
    
    // Apply audio routing using ref to avoid dependency issues
    if (remoteAudioRef.current && applyAudioRoutingRef.current) {
      try {
        applyAudioRoutingRef.current(remoteAudioRef.current, newSpeakerState);
      } catch (err) {
        console.error('Error in toggleSpeaker (non-critical):', err);
      }
    }
    
    console.log('📱 Speaker toggled:', newSpeakerState ? 'ON' : 'OFF');
  }, [isSpeaker]);

  // Send DTMF
  const sendDTMF = useCallback((digit) => {
    console.log('📱 Sending DTMF:', digit);
    soundManager.playDTMF(digit);
    
    if (currentCallRef.current) {
      try {
        currentCallRef.current.dtmf(digit);
      } catch (e) {
        console.error('DTMF failed:', e);
      }
    }
  }, []);

  // Format duration
  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  // Minimize call - allows navigation while on call
  const minimizeCall = useCallback(() => {
    setIsMinimized(true);
  }, []);

  // Expand call - return to call window
  const expandCall = useCallback(() => {
    setIsMinimized(false);
  }, []);

  // Keep WebRTC ready for real inbound rings even when user has not opened the dialer yet.
  useEffect(() => {
    const hasUserToken = typeof window !== 'undefined' && !!localStorage.getItem('token');
    if (!hasUserToken) return;
    if (isClientReadyRef.current || isInitializingRef.current) return;
    if (callStateRef.current !== CALL_STATES.IDLE) return;

    const timer = window.setTimeout(() => {
      initializeClient().catch((e) => {
        console.warn('📱 Background WebRTC init failed (will retry on demand):', e?.message || e);
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [initializeClient]);

  // Inbound calls: only via Telnyx WebRTC (telnyx.rtc.incoming / notifications). API polling was removed — it matched
  // stale DB rows after hangup and opened a second "Unknown" incoming UI while the real call was outbound.

  // Ensure call UI is visible when user returns to tab (e.g., after clicking notification)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to tab - ensure call UI is visible if there's an active/incoming call
        const currentState = callStateRef.current;
        if (currentState === CALL_STATES.INCOMING || currentState === CALL_STATES.ACTIVE) {
          console.log('📱 Page visible - ensuring call UI is visible for state:', currentState);
          setIsMinimized(false);
          
          // If we have an incoming call but state was lost, try to restore it
          if (currentState === CALL_STATES.INCOMING && !currentCallRef.current && remoteNumber) {
            console.log('📱 Attempting to restore incoming call state');
            // The call might still be active in the backend, but we can't restore the WebRTC call object
            // The user will need to answer/reject via the UI if it's still available
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [remoteNumber]);

  // Apply audio routing when speaker state changes during active call
  useEffect(() => {
    if (callState === CALL_STATES.ACTIVE && remoteAudioRef.current && applyAudioRoutingRef.current) {
      try {
        console.log('📱 Applying audio routing for speaker state:', isSpeaker);
        applyAudioRoutingRef.current(remoteAudioRef.current, isSpeaker);
      } catch (err) {
        console.warn('Error applying audio routing on speaker change (handled):', err);
      }
    }
  }, [isSpeaker, callState]);

  useEffect(() => {
    const onAuthoritative = async (ev) => {
      const payload = ev?.detail || {};
      const callId = payload?.callId != null ? String(payload.callId) : '';
      const activeId = outboundCallRecordIdRef.current != null ? String(outboundCallRecordIdRef.current) : '';
      if (!callId || !activeId || callId !== activeId) return;
      const gate = shouldAcceptAuthoritativePayload({
        sequence: payload.sequence,
        callStateVersion: payload.callStateVersion,
      });
      if (!gate.accept) {
        logParity('reject_stale_socket', { callId, reason: gate.reason, payload });
        return;
      }
      markAuthoritativeAccepted({
        sequence: payload.sequence,
        callStateVersion: payload.callStateVersion,
      });
      authoritativeBackendSeqRef.current = Math.max(
        authoritativeBackendSeqRef.current,
        Number(payload.sequence || 0)
      );
      const remote = payload.snapshot?.callStatus || payload.callStatus;
      logParity('authoritative_received', { callId, remote });
      const snap = await fetchCanonicalCallSnapshot(callId);
      if (snap?.status && remote && String(snap.status) !== String(remote)) {
        logParity('mismatch_after_fetch', { callId, apiStatus: snap.status, socketStatus: remote });
      }
    };
    window.addEventListener('otodial:call-authoritative-state', onAuthoritative);
    return () => window.removeEventListener('otodial:call-authoritative-state', onAuthoritative);
  }, []);

  // Defer Telnyx disconnect on unmount so React 18 StrictMode fake-unmount does not cancel in-flight connect().
  useEffect(() => {
    if (unmountDisconnectTimerRef.current != null) {
      clearTimeout(unmountDisconnectTimerRef.current);
      unmountDisconnectTimerRef.current = null;
    }
    callProviderAliveRef.current = true;
    return () => {
      callProviderAliveRef.current = false;
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (sdkCallStatePollRef.current != null) {
        clearInterval(sdkCallStatePollRef.current);
        sdkCallStatePollRef.current = null;
      }
      soundManager.stopAll();
      if (notificationRef.current) {
        notificationRef.current.close();
      }
      unmountDisconnectTimerRef.current = window.setTimeout(() => {
        unmountDisconnectTimerRef.current = null;
        if (callProviderAliveRef.current) {
          return;
        }
        if (telnyxClientRef.current) {
          try {
            console.log('📱 Telnyx disconnect (CallProvider unmount, deferred)');
            telnyxClientRef.current.disconnect();
          } catch (e) {
            console.error('Telnyx disconnect on unmount:', e);
          }
          telnyxClientRef.current = null;
        }
      }, 450);
    };
  }, []);

  const value = {
    // State
    callState,
    callDuration,
    isMuted,
    isOnHold,
    isSpeaker,
    remoteNumber,
    incomingCall,
    error,
    callPhaseLabel,
    callingMode,
    isClientReady,
    isInitializing,
    isMinimized,
    
    // Methods
    initializeClient,
    makeCall,
    answerCall,
    rejectCall,
    hangUp,
    toggleMute,
    toggleHold,
    toggleSpeaker,
    sendDTMF,
    formatDuration,
    minimizeCall,
    expandCall,
    
    // Constants
    CALL_STATES,
    
    // Helpers
    isInCall: callState !== CALL_STATES.IDLE,
    isRinging: callState === CALL_STATES.RINGING || callState === CALL_STATES.INCOMING,
    isActive: callState === CALL_STATES.ACTIVE,
    hasIncomingCall: callState === CALL_STATES.INCOMING
  };

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
};

export default CallContext;
