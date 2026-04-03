import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import API from '../api';
import soundManager from '../utils/sounds';
import { useWakeLock } from '../hooks/useWakeLock';

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
    return t.toLowerCase();
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
  if (raw === 'trying' || raw === 'recovering') return 20;
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

const TELNYX_REMOTE_AUDIO_ID = 'telnyx-remote-audio';

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
      callingMode: "unknown",
      CALL_STATES,
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
  const [isClientReady, setIsClientReady] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Resolve calling mode (build-time env via Vite).
  // - voice_api: always use backend Voice API calling (no in-browser audio).
  // - webrtc: always use WebRTC/SIP (requires SIP password + working /api/webrtc/token).
  // - auto/default: prefer WebRTC if SIP password is configured, else Voice API.
  const resolvedCallingMode = (() => {
    const mode = String(import.meta.env.VITE_CALLING_MODE || "").toLowerCase();
    if (mode === "voice_api") return "voice_api";
    if (mode === "webrtc") return "webrtc";
    return import.meta.env.VITE_TELNYX_SIP_PASSWORD ? "webrtc" : "voice_api";
  })();

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
  const voiceApiPollIntervalRef = useRef(null);
  const callStateRef = useRef(callState);
  const remoteAudioRef = useRef(null);
  const initializationPromiseRef = useRef(null);
  const isInitializedRef = useRef(false);
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
  /** Poll SDK call.state — some builds/envs omit telnyx.notification callUpdate for outbound */
  const sdkCallStatePollRef = useRef(null);
  /** Poll DB call row — webhook may set status=ringing before SDK exposes ringing/early */
  const backendCallStatusPollRef = useRef(null);
  /** Dedupe handleCallStateChange switch path (audio attach still runs above) */
  const lastCallUiFingerprintRef = useRef('');
  /** Drop bogus SDK "incoming" legs with no caller id right after hangup */
  const ignoreGhostIncomingUntilRef = useRef(0);
  /** True once we started ringback for this session (avoid repeat) */
  const outboundRingbackStartedRef = useRef(false);
  /** DB row id for this outbound session — copy onto any adopted Telnyx leg */
  const outboundCallRecordIdRef = useRef(null);
  /** `newCall()` return value — often not the leg that actually rings PSTN */
  const outboundNewCallLegRef = useRef(null);
  /** call.id -> Date.now() when first seen during this outbound session */
  const outboundLegArrivalMsRef = useRef({});
  /** User tapped hang up / reject — do not "hand off" to another leg */
  const userEndedFullCallRef = useRef(false);

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
    outboundRingbackStartedRef.current = false;
    outboundCallRecordIdRef.current = null;
    outboundNewCallLegRef.current = null;
    outboundLegArrivalMsRef.current = {};
  }, []);

  // Handle call end
  const handleCallEnd = useCallback(
    async ({ preserveError = false, finalStatus = "completed" } = {}) => {
    try {
      console.log('📱 Call ended, cleaning up...');

      pollBypassUntilRef.current = Date.now() + 60000;
      ignoreGhostIncomingUntilRef.current = Date.now() + 120000;
      polledCallIdRef.current = null;
      lastPolledIncomingIdRef.current = null;
      outboundDialActiveRef.current = false;
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
      if (backendCallStatusPollRef.current != null) {
        clearInterval(backendCallStatusPollRef.current);
        backendCallStatusPollRef.current = null;
      }

      // Stop sounds safely
      try {
        soundManager.stopAll();
        soundManager.playEnded();
      } catch (soundErr) {
        console.warn('Error stopping sounds (non-critical):', soundErr);
      }

      // Update call record in database (non-blocking)
      if (currentCallRef.current?._dbCallId) {
        const duration = callDurationRef.current;
        API.patch(`/api/calls/${currentCallRef.current._dbCallId}`, {
          status: finalStatus,
          durationSeconds: duration,
          callEndedAt: new Date().toISOString()
        }).then(() => {
          console.log('📱 Call record updated with final status:', finalStatus);
        }).catch(err => {
          console.warn('📱 Failed to update call record on end (non-critical):', err);
        });
      }

      // Clean up timer
      try {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (voiceApiPollIntervalRef.current) {
          clearInterval(voiceApiPollIntervalRef.current);
          voiceApiPollIntervalRef.current = null;
        }
      } catch (timerErr) {
        console.warn('Error clearing timer (non-critical):', timerErr);
      }

      // Clean up audio
      try {
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
        setError(null);
        setIncomingCall(null);
        setIsMinimized(false);
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
        if (voiceApiPollIntervalRef.current) {
          clearInterval(voiceApiPollIntervalRef.current);
          voiceApiPollIntervalRef.current = null;
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

      // Attach remote audio stream when available
      try {
      if (call.remoteStream && remoteAudioRef.current) {
        if (remoteAudioRef.current.srcObject !== call.remoteStream) {
          console.log('📱 Attaching remote audio stream');
          remoteAudioRef.current.srcObject = call.remoteStream;
          
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
          } catch {}
          remoteAudioRef.current.play().catch((e) => {
            console.warn('Audio play failed:', e);
            const name = String(e?.name || "");
            if (name === "NotAllowedError" || name === "AbortError") {
              setError("Audio playback was blocked by the browser. Tap the call screen once to enable audio.");
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
            console.log('[CALL FLOW] STATE UPDATED → connecting (inbound early)');
          } catch (err) {
            console.error('Error setting connecting state (handled):', err);
          }
        } else {
          try {
            setCallState(CALL_STATES.DIALING);
            console.log('[CALL FLOW] STATE UPDATED → dialing (Telnyx new/requesting)');
            if (call._dbCallId) {
              API.patch(`/api/calls/${call._dbCallId}`, { status: 'dialing' }).catch(() => {});
            }
          } catch (err) {
            console.error('Error in outbound new→dialing UI (handled):', err);
            setCallState(CALL_STATES.DIALING);
          }
        }
        break;
      case 'trying':
      case 'recovering':
        if (isInboundIncomingForUi(call, outboundDialActiveRef, currentCallRef)) {
          try {
            setCallState(CALL_STATES.CONNECTING);
            console.log('[CALL FLOW] STATE UPDATED → connecting (inbound trying)');
          } catch (err) {
            console.error('Error setting connecting state (handled):', err);
          }
        } else {
          try {
            setCallState(CALL_STATES.DIALING);
            console.log('[CALL FLOW] STATE UPDATED → dialing (Telnyx trying/recovering)');
            if (call._dbCallId) {
              API.patch(`/api/calls/${call._dbCallId}`, { status: 'dialing' }).catch(() => {});
            }
          } catch (err) {
            console.error('Error in outbound trying→dialing UI (handled):', err);
            setCallState(CALL_STATES.DIALING);
          }
        }
        break;
      case 'ringing':
      case 'early':
        try {
          // Mark synchronously to avoid relying on async React state timing.
          call._sawRinging = true;
          setCallState(CALL_STATES.RINGING);
          console.log('[CALL FLOW] STATE UPDATED → ringing (Telnyx ringing/early)');
          if (!outboundRingbackStartedRef.current) {
            outboundRingbackStartedRef.current = true;
            try {
              soundManager.startRingback();
            } catch (soundErr) {
              console.warn('Sound manager error (non-critical):', soundErr);
            }
          }
          if (call._dbCallId) {
            API.patch(`/api/calls/${call._dbCallId}`, { status: 'ringing' }).catch(() => {});
          }
        } catch (err) {
          console.error('Error in ringing state (handled):', err);
          setCallState(CALL_STATES.RINGING);
        }
        break;
      case 'answering':
        try {
          setCallState(CALL_STATES.CONNECTING);
        } catch (err) {
          console.error('Error setting answering state (handled):', err);
        }
        break;
      case 'active':
        try {
          // Mark synchronously to avoid relying on async React state timing.
          call._sawActive = true;
          setCallState(CALL_STATES.ACTIVE);
          console.log('[CALL FLOW] STATE UPDATED → active (Telnyx)');
          
          // Stop sounds safely
          try {
            soundManager.stopRingback();
            soundManager.stopRingtone();
            soundManager.playConnected();
          } catch (soundErr) {
            console.warn('Sound manager error (non-critical):', soundErr);
          }
          
          // Start duration timer safely
          try {
            startDurationTimer();
          } catch (timerErr) {
            console.warn('Duration timer error (non-critical):', timerErr);
          }
          
          // Ensure audio routing is applied when call becomes active
          if (remoteAudioRef.current && call.remoteStream) {
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
          
          // Update call record to in-progress (non-blocking)
          if (call._dbCallId) {
            API.patch(`/api/calls/${call._dbCallId}`, { 
              status: 'in-progress',
              callStartedAt: new Date().toISOString()
            }).catch(e => {
              console.warn('Failed to update call record (non-critical):', e);
            });
          }
        } catch (err) {
          // Catch any unexpected errors to prevent ErrorBoundary from triggering
          console.error('Error in active call state handler (handled):', err);
          // Still set the state to active even if other operations fail
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
          const client = telnyxClientRef.current;
          const remaining = Object.values(client?.calls || {}).filter(
            (x) => x && x !== call && !isTelnyxTerminalCall(x)
          );
          if (outboundDialActiveRef.current && remaining.length > 0) {
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
          handleCallEnd();
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
  const initializeClient = useCallback(async () => {
    if (resolvedCallingMode !== "webrtc") {
      return false;
    }

    // Prevent multiple initializations
    if (initializationPromiseRef.current) {
      console.log('📱 Already initializing, waiting...');
      return initializationPromiseRef.current;
    }

    // If already connected and ready, return true (use refs)
    if (telnyxClientRef.current && isClientReadyRef.current && isInitializedRef.current) {
      console.log('📱 Client already ready');
      return true;
    }

    setIsInitializing(true);
    setError(null);
    
    initializationPromiseRef.current = (async () => {
      try {
        console.log('📱 Initializing Telnyx WebRTC client...');
        
        // Get credentials from backend
        const response = await API.get('/api/webrtc/token');
        
        if (response.error) {
          console.error('Failed to get WebRTC credentials:', response.error);
          setError(response.error);
          setIsInitializing(false);
          return false;
        }

        const creds = response.data?.credentials;
        if (!creds || !creds.sipUsername) {
          console.error('Invalid credentials received');
          setError('Invalid calling credentials');
          setIsInitializing(false);
          return false;
        }

        setCredentials(creds);

        // Get SIP password from frontend env (required for forced WebRTC mode)
        const sipPassword = import.meta.env.VITE_TELNYX_SIP_PASSWORD;
        if (!sipPassword) {
          console.error('Missing VITE_TELNYX_SIP_PASSWORD');
          setError('Calling password not configured');
          setIsClientReady(false);
          setIsInitializing(false);
          isInitializedRef.current = false;
          return false;
        }

        console.log('📱 Creating TelnyxRTC client with username:', creds.sipUsername);

        // Disconnect existing client if any
        if (telnyxClientRef.current) {
          try {
            telnyxClientRef.current.disconnect();
          } catch (e) {}
          telnyxClientRef.current = null;
        }

        // Create new Telnyx WebRTC client
        const client = new TelnyxRTC({
          login: creds.sipUsername,
          password: sipPassword,
          ringtoneFile: null,
          ringbackFile: null,
        });

        // Store reference immediately
        telnyxClientRef.current = client;
        // Required for SDK to attach remote MediaStream to your <audio> (see Telnyx README)
        client.remoteElement = TELNYX_REMOTE_AUDIO_ID;

        // Promise to wait for ready
        const readyPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout - please check your credentials'));
          }, 15000);

          client.on('telnyx.ready', () => {
            clearTimeout(timeout);
            console.log('✅ Telnyx WebRTC client ready!');
            setIsClientReady(true);
            setError(null);
            setIsInitializing(false);
            isInitializedRef.current = true;
            resolve(true);
          });

          client.on('telnyx.error', (err) => {
            clearTimeout(timeout);
            console.error('❌ Telnyx error:', err);
            setError(err.message || 'Connection error');
            setIsClientReady(false);
            setIsInitializing(false);
            reject(err);
          });
        });

        client.on('telnyx.socket.close', () => {
          console.log('📱 Telnyx socket closed - attempting to reconnect...');
          setIsClientReady(false);
          isInitializedRef.current = false;
          
          // Auto-reconnect after a delay (use refs)
          setTimeout(() => {
            if (!isClientReadyRef.current && !isInitializingRef.current) {
              console.log('📱 Attempting to reconnect WebRTC client...');
              initializeClient().catch(e => {
                console.log('📱 Reconnection failed:', e.message);
              });
            }
          }, 3000);
        });
        
        // Monitor connection health
        client.on('telnyx.socket.open', () => {
          console.log('📱 Telnyx socket opened - connection active');
        });

        client.on('telnyx.rtc.incoming', (call) => {
          console.log('📱 telnyx.rtc.incoming:', call);
          handleIncomingCallEventRef.current(call);
        });

        client.on('telnyx.notification', (notification) => {
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
          if (outboundDialActiveRef.current && call.id != null && outboundLegArrivalMsRef.current[call.id] == null) {
            outboundLegArrivalMsRef.current[call.id] = Date.now();
          }
          console.log('📱 client call event:', call.direction, normalizeTelnyxCallState(getRawTelnyxCallState(call)));
          if (isInboundIncomingForUi(call, outboundDialActiveRef, currentCallRef)) {
            handleIncomingCallEventRef.current(call);
          } else {
            handleCallStateChangeRef.current(call);
          }
          handleCallStateChangeRef.current(call);
        });

        client.on('incoming', (call) => {
          handleIncomingCallEventRef.current(call);
        });

        // Connect to Telnyx
        console.log('📱 Connecting to Telnyx...');
        console.log('📱 SIP Username:', creds.sipUsername);
        console.log('📱 Connection ID:', creds.connectionId);
        
        await client.connect();
        
        // Wait for ready
        await readyPromise;
        
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
        setError(err.message || 'Failed to connect to calling service');
        setIsInitializing(false);
        setIsClientReady(false);
        return false;
      } finally {
        initializationPromiseRef.current = null;
      }
    })();

    return initializationPromiseRef.current;
  }, []);

  // Save call record to database
  const saveCallRecord = useCallback(async (toNumber, fromNumber, direction = 'outbound', status = 'dialing') => {
    console.log('[CALL FLOW] API CALL SENT (POST /api/calls)', { toNumber, fromNumber, direction, status });
    const response = await API.post('/api/calls', {
      phoneNumber: toNumber,
      fromNumber: fromNumber,
      toNumber: toNumber,
      direction,
      status,
    });

    if (response.status === 409) {
      const msg = response.data?.error || response.error || 'Call already in progress';
      console.warn('[CALL FLOW] API rejected duplicate call (409):', msg);
      return { ok: false, error: msg };
    }
    if (response.error || !response.data?.call?._id) {
      console.warn('[CALL FLOW] Failed to create call record:', response.error || response.data);
      return { ok: false, error: response.error || 'Failed to create call' };
    }
    console.log('[CALL FLOW] CALL CREATED (DB)', { callId: response.data.call._id });
    return { ok: true, callId: response.data.call._id };
  }, []);

  // Update call record in database
  const updateCallRecord = useCallback(async (callId, updates) => {
    if (!callId) return;
    try {
      await API.patch(`/api/calls/${callId}`, updates);
      console.log('📱 Call record updated:', callId, updates);
    } catch (err) {
      console.warn('📱 Failed to update call record:', err);
    }
  }, []);

  const normalizeDialableNumber = useCallback((input, { assumeUsForTenDigits = false } = {}) => {
    const raw = String(input || "").trim();
    if (!raw) return null;

    const sanitized = raw.replace(/[^\d+]/g, "");
    if (!sanitized) return null;

    let normalized = sanitized;
    if (normalized.startsWith("00")) {
      normalized = `+${normalized.slice(2)}`;
    }

    if (!normalized.startsWith("+")) {
      const digitsOnly = normalized.replace(/\D/g, "");
      if (!digitsOnly) return null;
      normalized =
        assumeUsForTenDigits && digitsOnly.length === 10
          ? `+1${digitsOnly}`
          : `+${digitsOnly}`;
    } else {
      normalized = `+${normalized.slice(1).replace(/\D/g, "")}`;
    }

    return /^\+\d{8,15}$/.test(normalized) ? normalized : null;
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
      const voiceResponse = await API.post("/api/numbers/fix-voice");
      if (voiceResponse?.error) {
        throw new Error(voiceResponse.error);
      }
      hasAttemptedPhoneConfigFixRef.current = true;
      console.log("📱 Voice connection sync completed");
      return true;
    } catch (voiceErr) {
      // Fallback to full repair path for environments that only expose fix-all.
      try {
        const fullResponse = await API.post("/api/numbers/fix-all");
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
    console.log('[CALL FLOW] CALL BUTTON / makeCall', { destinationNumber, callerIdNumber });
    console.log('📱 Current state:', { isClientReady, hasClient: !!telnyxClientRef.current, callState: callStateRef.current });
    
    const normalizedDestination = normalizeDialableNumber(destinationNumber, { assumeUsForTenDigits: true });

    if (!normalizedDestination) {
      console.log('📱 No destination number');
      setError('Please enter a valid phone number in international format (example: +14155550123).');
      return false;
    }

    try {
      setError(null);
      outboundDialActiveRef.current = true;
      outboundRingbackStartedRef.current = false;
      setRemoteNumber(destinationNumber);
      setIsMinimized(false);

      // Initialize client if needed (use ref — React state can lag behind telnyx.ready)
      if (!telnyxClientRef.current || !isClientReadyRef.current) {
        console.log('📱 Client not ready, initializing...');
        const initialized = await initializeClient();
        console.log('📱 Initialization result:', initialized);
        if (!initialized) {
          console.error('📱 Failed to initialize client');
          outboundDialActiveRef.current = false;
          setError('Failed to connect to calling service. Please try again.');
          setCallState(CALL_STATES.IDLE);
          resetOutboundRetryState();
          return false;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!telnyxClientRef.current) {
        console.log('📱 Client ref is null after initialization');
        outboundDialActiveRef.current = false;
        setError('Calling service not available');
        setCallState(CALL_STATES.IDLE);
        resetOutboundRetryState();
        return false;
      }
      if (!isClientReadyRef.current) {
        console.log('📱 Client still not ready after initialization wait');
        setError('Calling service is still connecting. Please try again in a moment.');
        setCallState(CALL_STATES.IDLE);
        resetOutboundRetryState();
        return false;
      }

      let callerId = callerIdNumber;
      if (!callerId && credentials?.callerIdNumber) {
        callerId = credentials.callerIdNumber;
      }

      if (!callerId) {
        console.log('📱 No caller ID available');
        outboundDialActiveRef.current = false;
        setError('No caller ID available. Please purchase a phone number first.');
        setCallState(CALL_STATES.IDLE);
        resetOutboundRetryState();
        return false;
      }

      const destE164 = normalizeDialNumber(destinationNumber);
      const callerE164 = normalizeDialNumber(callerId);
      if (!destE164) {
        outboundDialActiveRef.current = false;
        setError('Invalid phone number');
        setCallState(CALL_STATES.IDLE);
        return false;
      }
      console.log('[CALL FLOW] WebRTC newCall next', { from: callerE164, to: destE164 });

      const saved = await saveCallRecord(destE164, callerE164, 'outbound', 'dialing');
      if (!saved.ok) {
        outboundDialActiveRef.current = false;
        setError(saved.error || 'Could not start call');
        setCallState(CALL_STATES.IDLE);
        return false;
      }
      const callRecordId = saved.callId;
      outboundCallRecordIdRef.current = callRecordId || null;

      setCallState(CALL_STATES.DIALING);
      console.log('[CALL FLOW] STATE UPDATED → dialing (backend row ready, waiting for Telnyx)');

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

      console.log('[CALL FLOW] WebRTC newCall returned:', !!call);

      if (!call) {
        outboundDialActiveRef.current = false;
        outboundCallRecordIdRef.current = null;
        setError('Failed to create call');
        setCallState(CALL_STATES.IDLE);
        if (callRecordId) {
          updateCallRecord(callRecordId, { status: 'failed' });
        }
        resetOutboundRetryState();
        return false;
      }

      currentCallRef.current = call;
      outboundNewCallLegRef.current = call;
      outboundLegArrivalMsRef.current = { [call.id]: Date.now() };
      call._dbCallId = callRecordId;
      call._usedDefaultCallerFallback = false;

      handleCallStateChangeRef.current(call);

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

      if (backendCallStatusPollRef.current != null) {
        clearInterval(backendCallStatusPollRef.current);
        backendCallStatusPollRef.current = null;
      }
      backendCallStatusPollRef.current = window.setInterval(async () => {
        if (!outboundDialActiveRef.current) return;
        const id = outboundCallRecordIdRef.current;
        if (!id) return;
        const cs = callStateRef.current;
        if (cs === CALL_STATES.ACTIVE || cs === CALL_STATES.IDLE || cs === CALL_STATES.ENDING) return;
        const resp = await API.get(`/api/calls/${id}`);
        if (resp.error || !resp.data?.call?.status) return;
        const st = resp.data.call.status;
        if (st === 'ringing' && cs === CALL_STATES.DIALING) {
          setCallState(CALL_STATES.RINGING);
          console.log('[CALL FLOW] STATE UPDATED → ringing (backend/webhook poll)');
          if (!outboundRingbackStartedRef.current) {
            outboundRingbackStartedRef.current = true;
            try {
              soundManager.startRingback();
            } catch (e) {
              console.warn('Ringback (backend sync):', e);
            }
          }
        }
      }, 1000);

      console.log('[CALL FLOW] WebRTC session started (SDK + backend poll active)');
      return true;
    } catch (err) {
      console.error('📱 Failed to make call:', err);
      outboundDialActiveRef.current = false;
      outboundCallRecordIdRef.current = null;
      outboundNewCallLegRef.current = null;
      outboundLegArrivalMsRef.current = {};
      setError(err.message || 'Failed to initiate call');
      setCallState(CALL_STATES.IDLE);
      resetOutboundRetryState();
      return false;
    }
  }, [
    startDurationTimer,
    handleCallEnd,
    initializeClient,
    credentials,
    saveCallRecord,
    updateCallRecord,
    normalizeDialableNumber,
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
          // Fallback: Try to update status manually
          try {
            await API.patch(`/api/calls/${callRecordId}`, {
              status: 'answered',
              callStartedAt: new Date().toISOString()
            });
          } catch (updateErr) {
            console.warn('📱 Failed to update call record:', updateErr);
          }
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
    soundManager.stopRingtone();
    manualHangupRef.current = true;
    
    // Close notification if it exists
    if (notificationRef.current) {
      notificationRef.current.close();
      notificationRef.current = null;
    }
    
    hangupAllSessionCalls();
    
    // Update backend call record to missed
    try {
      let callRecordId = polledCallIdRef.current;
      
      // If we don't have a polled call ID, try to find it
      if (!callRecordId) {
        const callsResponse = await API.get('/api/calls?status=ringing&direction=inbound&limit=1');
        if (callsResponse.data?.calls && callsResponse.data.calls.length > 0) {
          callRecordId = callsResponse.data.calls[0].id || callsResponse.data.calls[0]._id;
        }
      }
      
      if (callRecordId) {
        await API.patch(`/api/calls/${callRecordId}`, {
          status: 'missed',
          callEndedAt: new Date().toISOString()
        });
        console.log('📱 Call record updated to missed');
        polledCallIdRef.current = null; // Clear after use
      }
    } catch (updateErr) {
      console.warn('📱 Failed to update call record:', updateErr);
    }
    
    handleCallEnd();
  }, [handleCallEnd, hangupAllSessionCalls]);

  // Hang up current call
  const hangUp = useCallback(() => {
    console.log('📱 Hanging up...');
    userEndedFullCallRef.current = true;
    hangupAllSessionCalls();
    handleCallEnd();
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
          playPromise.catch(() => {
            // Ignore play errors - they're usually just autoplay policy issues
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

  // Auto-initialize client when component mounts (for receiving calls)
  useEffect(() => {
    const autoInit = async () => {
      const token = localStorage.getItem('token');
      if (resolvedCallingMode !== "webrtc") return;
      if (token && !isClientReadyRef.current && !isInitializingRef.current && !isInitializedRef.current) {
        console.log('📱 Auto-initializing WebRTC client for incoming calls...');

        await fixPhoneConfiguration();

        setTimeout(() => {
          initializeClient().catch(e => {
            console.log('📱 Auto-init failed:', e.message);
          });
        }, 500);
      }
    };
    
    autoInit();
    
    // Also set up a periodic health check to ensure client stays connected
    const healthCheckInterval = setInterval(() => {
      const token = localStorage.getItem('token');
      if (resolvedCallingMode !== "webrtc") return;
      // Use refs to avoid dependency on changing state
      if (token && !isClientReadyRef.current && !isInitializingRef.current && !isInitializedRef.current) {
        console.log('📱 Health check: Client not ready, reinitializing...');
        initializeClient().catch(e => {
          console.log('📱 Health check reinit failed:', e.message);
        });
      } else if (token && isClientReadyRef.current && telnyxClientRef.current) {
        // Verify client is still connected
        try {
          // Check if client has a connection state
          if (telnyxClientRef.current.connected === false) {
            console.log('📱 Health check: Client disconnected, reconnecting...');
            setIsClientReady(false);
            isInitializedRef.current = false;
            initializeClient().catch(e => {
              console.log('📱 Health check reconnect failed:', e.message);
            });
          }
        } catch (e) {
          // Client might not have connected property, that's okay
        }
      }
    }, 60000); // Check every 60 seconds (reduced frequency)
    
    return () => clearInterval(healthCheckInterval);
  }, [fixPhoneConfiguration, initializeClient]); // Removed frequently changing deps

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (sdkCallStatePollRef.current != null) {
        clearInterval(sdkCallStatePollRef.current);
        sdkCallStatePollRef.current = null;
      }
      if (backendCallStatusPollRef.current != null) {
        clearInterval(backendCallStatusPollRef.current);
        backendCallStatusPollRef.current = null;
      }
      soundManager.stopAll();
      if (notificationRef.current) {
        notificationRef.current.close();
      }
      if (telnyxClientRef.current) {
        try {
          telnyxClientRef.current.disconnect();
        } catch (e) {}
      }
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
    callingMode: resolvedCallingMode,
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
