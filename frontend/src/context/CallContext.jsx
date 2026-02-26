import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import API from '../api';
import soundManager from '../utils/sounds';
import { useWakeLock } from '../hooks/useWakeLock';

const CallContext = createContext(null);

// Call states
export const CALL_STATES = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  RINGING: 'ringing',
  ACTIVE: 'active',
  HELD: 'held',
  INCOMING: 'incoming',
  ENDING: 'ending'
};

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

  // Keep screen awake during active calls (mobile)
  const isActiveCall = callState === CALL_STATES.ACTIVE || callState === CALL_STATES.RINGING || callState === CALL_STATES.INCOMING;
  useWakeLock(isActiveCall);

  // Refs
  const telnyxClientRef = useRef(null);
  const currentCallRef = useRef(null);
  const durationIntervalRef = useRef(null);
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
  const callListenerRegistryRef = useRef(new WeakSet());
  const handledIncomingCallIdsRef = useRef(new Set());
  const handledTerminalCallIdsRef = useRef(new Set());
  const hasAttemptedPhoneConfigFixRef = useRef(false);
  const lastPhoneConfigFixAtRef = useRef(0);
  const manualHangupRef = useRef(false);
  const outboundRetryRef = useRef({
    attempted: false,
    destinationNumber: null,
    callRecordId: null,
    originalCallerNumber: null,
    lastStrategy: null,
    retryStrategies: [],
    nextRetryIndex: 0,
    outboundRepairAttempted: false,
    outboundRepairAttemptedAt: 0,
    outboundRepairSummary: null,
    outboundRepairError: null
  });

  const getCallDirection = useCallback((call = {}) => {
    const rawDirection =
      call.direction ||
      call.options?.direction ||
      call.options?.callDirection ||
      call.callDirection ||
      null;
    return String(rawDirection || "").toLowerCase();
  }, []);

  const getCallUniqueId = useCallback((call = {}) => {
    return (
      call.id ||
      call.callId ||
      call.callID ||
      call.call_control_id ||
      call.callControlId ||
      call.options?.callID ||
      call.options?.callId ||
      call.options?.call_control_id ||
      null
    );
  }, []);

  const getCallHangupCause = useCallback((call = {}) => {
    const cause =
      call.hangupCause ||
      call.hangup_cause ||
      call.cause ||
      call.options?.hangupCause ||
      call.options?.hangup_cause ||
      null;

    if (!cause) return null;

    return String(cause)
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const resetOutboundRetryState = useCallback(() => {
    outboundRetryRef.current = {
      attempted: false,
      destinationNumber: null,
      callRecordId: null,
      originalCallerNumber: null,
      lastStrategy: null,
      retryStrategies: [],
      nextRetryIndex: 0,
      outboundRepairAttempted: false,
      outboundRepairAttemptedAt: 0,
      outboundRepairSummary: null,
      outboundRepairError: null
    };
  }, []);
  
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
      audio.id = 'telnyx-remote-audio';
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

  // Handle call end
  const handleCallEnd = useCallback(
    async ({ preserveError = false, finalStatus = "completed" } = {}) => {
    try {
      console.log('📱 Call ended, cleaning up...');
      
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
        setRemoteNumber('');
        if (!preserveError) {
          setError(null);
        }
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
      console.log('📱 Call state changed:', call.state, call);
      currentCallRef.current = call;

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
          
          remoteAudioRef.current.play().catch(e => console.warn('Audio play failed:', e));
        }
      }
    } catch (audioErr) {
      console.warn('Error attaching audio stream (non-critical):', audioErr);
    }
    
    const callDirection = getCallDirection(call);

    // Only route to incoming handler for true incoming calls.
    if (call.state === 'ringing' && callDirection === 'incoming' && callStateRef.current !== CALL_STATES.INCOMING) {
      try {
        console.log('📱 Detected incoming call in state change handler');
        handleIncomingCallEventRef.current(call);
        return; // Don't process state change further, incoming call handler will do it
      } catch (err) {
        console.error('Error handling incoming call (handled):', err);
        // Continue to process state change even if incoming call handler fails
      }
    }

    try {
      switch (call.state) {
      case 'new':
      case 'trying':
      case 'requesting':
        try {
          setCallState(CALL_STATES.CONNECTING);
        } catch (err) {
          console.error('Error setting connecting state (handled):', err);
        }
        break;
      case 'ringing':
      case 'early':
        try {
          // Mark synchronously to avoid relying on async React state timing.
          call._sawRinging = true;
          setCallState(CALL_STATES.RINGING);
          try {
            soundManager.startRingback();
          } catch (soundErr) {
            console.warn('Sound manager error (non-critical):', soundErr);
          }
          // Update call record to ringing (non-blocking)
          if (call._dbCallId) {
            API.patch(`/api/calls/${call._dbCallId}`, { status: 'ringing' }).catch(e => {
              console.warn('Failed to update call record (non-critical):', e);
            });
          }
        } catch (err) {
          console.error('Error in ringing state (handled):', err);
          setCallState(CALL_STATES.RINGING); // Still set state even if other operations fail
        }
        break;
      case 'active':
        try {
          // Mark synchronously to avoid relying on async React state timing.
          call._sawActive = true;
          setCallState(CALL_STATES.ACTIVE);
          
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
          const terminalCallId = getCallUniqueId(call);
          if (terminalCallId) {
            if (handledTerminalCallIdsRef.current.has(terminalCallId)) {
              break;
            }
            handledTerminalCallIdsRef.current.add(terminalCallId);
            if (handledTerminalCallIdsRef.current.size > 200) {
              const recent = Array.from(handledTerminalCallIdsRef.current).slice(-120);
              handledTerminalCallIdsRef.current = new Set(recent);
            }
          }

          // Some SDK versions emit multiple terminal state changes (hangup/done/destroy).
          // Guard so we don't trigger multiple retries or double-cleanup.
          if (call._handledTermination) {
            break;
          }
          call._handledTermination = true;

          const callDirection = getCallDirection(call);
          const hangupCause = getCallHangupCause(call);
          const hangupCauseLower = String(hangupCause || "").toLowerCase();
          const disconnectedBeforeRinging =
            !manualHangupRef.current &&
            callDirection !== "incoming" &&
            !call._sawRinging &&
            !call._sawActive;
          const retryMeta = outboundRetryRef.current;

          const nextRetryStrategy =
            retryMeta.retryStrategies?.[retryMeta.nextRetryIndex] || null;
          const shouldRetryWithFallback =
            disconnectedBeforeRinging &&
            !!nextRetryStrategy &&
            !!retryMeta.destinationNumber &&
            !!telnyxClientRef.current &&
            // Retry any pre-ringing failure: root cause can be number formatting,
            // caller ID permissioning, or connection defaults. We'll stop once
            // strategies are exhausted.
            !manualHangupRef.current;

          if (shouldRetryWithFallback) {
            try {
              const looksLikeProviderRejection =
                /(call rejected|rejected|forbidden|unauthorized|not allowed|invalid caller|caller id|origination)/i.test(
                  hangupCauseLower
                );

              // Best-effort auto-repair: if Telnyx is rejecting the call, ensure the
              // credential connection has an outbound voice profile and permits the destination.
              // This is safe to run once per call attempt and often fixes "CALL REJECTED".
              if (looksLikeProviderRejection && !retryMeta.outboundRepairAttempted) {
                retryMeta.outboundRepairAttempted = true;
                retryMeta.outboundRepairAttemptedAt = Date.now();
                try {
                  console.warn("📱 Attempting Telnyx outbound repair after CALL REJECTED...");
                  const repairResp = await API.post("/api/webrtc/repair-outbound", {
                    destinationNumber: retryMeta.destinationNumber,
                    callerNumber: retryMeta.originalCallerNumber
                  });
                  if (repairResp?.error) {
                    console.warn("📱 Outbound repair returned error (non-blocking):", repairResp.error);
                    retryMeta.outboundRepairError = repairResp.error;
                  } else if (repairResp?.data?.actions?.length) {
                    console.warn("📱 Outbound repair applied:", repairResp.data.actions);
                    retryMeta.outboundRepairSummary = `Applied: ${repairResp.data.actions.join(", ")}`;
                    if (repairResp.data?.warnings?.length) {
                      retryMeta.outboundRepairSummary += ` | Warnings: ${repairResp.data.warnings.join(" | ")}`;
                    }
                  } else if (repairResp?.data?.warnings?.length) {
                    retryMeta.outboundRepairSummary = `Warnings: ${repairResp.data.warnings.join(" | ")}`;
                  }
                } catch (repairErr) {
                  console.warn("📱 Outbound repair failed (non-blocking):", repairErr?.message || repairErr);
                  retryMeta.outboundRepairError = repairErr?.message || String(repairErr);
                }
              }

              retryMeta.attempted = true;
              retryMeta.lastStrategy = nextRetryStrategy.label;
              retryMeta.nextRetryIndex += 1;

              console.warn(
                `📱 Outbound call rejected before ringing. Retrying with fallback strategy: ${nextRetryStrategy.label}`
              );
              setError(null);
              setCallState(CALL_STATES.CONNECTING);

              const retryOptions = {
                destinationNumber: nextRetryStrategy.destinationNumber || retryMeta.destinationNumber,
                audio: true,
                video: false
              };
              if (typeof nextRetryStrategy.callerNumber === "string" && nextRetryStrategy.callerNumber.trim()) {
                retryOptions.callerNumber = nextRetryStrategy.callerNumber;
              }

              const retryCall = telnyxClientRef.current.newCall(retryOptions);

              if (!retryCall) {
                throw new Error("Retry call object was not created");
              }

              retryCall._dbCallId = retryMeta.callRecordId || call._dbCallId || null;
              retryCall._usedDefaultCallerFallback = nextRetryStrategy.callerNumber == null;
              retryCall._fallbackStrategyLabel = nextRetryStrategy.label;
              currentCallRef.current = retryCall;

              if (typeof retryCall.on === "function" && !callListenerRegistryRef.current.has(retryCall)) {
                callListenerRegistryRef.current.add(retryCall);
                retryCall.on("stateChange", () => {
                  handleCallStateChangeRef.current(retryCall);
                });
              }

              console.log(
                `📱 Retry call initiated with fallback strategy: ${nextRetryStrategy.label}`
              );
              break;
            } catch (retryErr) {
              console.error("📱 Retry attempt failed:", retryErr);
              setError(
                "Call rejected before ringing. Automatic fallback retries failed. Please verify Telnyx outbound voice profile permissions for this connection."
              );
              handleCallEnd({ preserveError: true, finalStatus: "failed" });
              break;
            }
          }

          if (disconnectedBeforeRinging) {
            const isAfterFallback =
              call._usedDefaultCallerFallback || (retryMeta.lastStrategy && retryMeta.lastStrategy !== "primary");
            const baseError =
              isAfterFallback
                ? hangupCause
                  ? `Call failed before ringing (${hangupCause}) even after fallback. Verify Telnyx outbound voice profile and caller ID permissions.`
                  : "Call failed before ringing even after fallback. Verify Telnyx outbound voice profile and caller ID permissions."
                : hangupCause
                  ? `Call failed before ringing (${hangupCause}). Please verify your caller ID number and destination format.`
                  : "Call failed before ringing. Please verify your caller ID number and destination format."
            const hasRepairInfo =
              retryMeta.outboundRepairAttempted &&
              (retryMeta.outboundRepairSummary || retryMeta.outboundRepairError);
            const repairSuffix = hasRepairInfo
              ? ` Auto-repair: ${retryMeta.outboundRepairSummary || retryMeta.outboundRepairError}`
              : "";
            setError(`${baseError}${repairSuffix}`);
            handleCallEnd({ preserveError: true, finalStatus: "failed" });
            break;
          }

          handleCallEnd();
        } catch (err) {
          console.error('Error in handleCallEnd (handled):', err);
        }
        break;
      default:
        console.log('📱 Unknown call state:', call.state);
        break;
    }
    } catch (switchErr) {
      console.error('Error in call state switch (handled):', switchErr);
      // Set state to active as fallback if we're in an active call
      if (call.state === 'active') {
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
      // Try to set state based on call.state as fallback
      if (call?.state === 'active') {
        try {
          setCallState(CALL_STATES.ACTIVE);
        } catch (e) {
          // If even setting state fails, log it but don't throw
          console.error('Critical: Failed to set call state:', e);
        }
      }
    }
  }, [startDurationTimer, handleCallEnd, getCallDirection, getCallHangupCause, getCallUniqueId]); // Removed applyAudioRouting - use ref instead

  // Handle incoming call
  const handleIncomingCallEvent = useCallback((call) => {
    if (!call) {
      return;
    }

    const direction = getCallDirection(call);
    if (direction && direction !== "incoming") {
      return;
    }

    const callUniqueId = getCallUniqueId(call);
    if (callUniqueId && handledIncomingCallIdsRef.current.has(callUniqueId)) {
      console.log("📱 Duplicate incoming call event ignored:", callUniqueId);
      return;
    }
    if (callUniqueId) {
      handledIncomingCallIdsRef.current.add(callUniqueId);
      if (handledIncomingCallIdsRef.current.size > 100) {
        const recentIds = Array.from(handledIncomingCallIdsRef.current).slice(-50);
        handledIncomingCallIdsRef.current = new Set(recentIds);
      }
    }

    // Prevent duplicate handling by object reference.
    if (callStateRef.current === CALL_STATES.INCOMING && currentCallRef.current === call) {
      console.log("📱 Incoming call already being handled, ignoring duplicate");
      return;
    }

    const callerNumber =
      call.options?.remoteCallerNumber ||
      call.options?.callerNumber ||
      call.options?.caller_id_number ||
      call.remoteCallerNumber ||
      call.callerNumber ||
      call.from ||
      "Unknown";

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

    // Attach state listener once per call instance.
    if (typeof call.on === "function" && !callListenerRegistryRef.current.has(call)) {
      callListenerRegistryRef.current.add(call);
      call.on("stateChange", () => {
        handleCallStateChangeRef.current(call);
      });
    }
  }, [getCallDirection, getCallUniqueId]); // Uses refs for mutable state
  
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

        // Get SIP password from frontend env
        const sipPassword = import.meta.env.VITE_TELNYX_SIP_PASSWORD;
        if (!sipPassword) {
          console.error('Missing VITE_TELNYX_SIP_PASSWORD');
          setError('Calling password not configured');
          setIsInitializing(false);
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

        // COMPREHENSIVE INCOMING CALL DETECTION
        // Telnyx WebRTC SDK can fire incoming calls through multiple events
        // We'll listen to ALL possible event patterns
        
        // Pattern 1: telnyx.rtc.incoming
        client.on('telnyx.rtc.incoming', (call) => {
          console.log('📱 INCOMING CALL via telnyx.rtc.incoming:', call);
          handleIncomingCallEventRef.current(call);
        });
        
        // Pattern 2: telnyx.notification with incomingCall type
        client.on('telnyx.notification', (notification) => {
          console.log('📱 Telnyx notification:', notification.type, notification);
          
          if (notification.type === 'callUpdate' && notification.call) {
            handleCallStateChangeRef.current(notification.call);
          }
          
          if (notification.type === 'incomingCall' && notification.call) {
            console.log('📱 INCOMING CALL via notification.incomingCall:', notification.call);
            handleIncomingCallEventRef.current(notification.call);
          }
        });
        
        // Pattern 3: Direct call events (some SDK versions)
        client.on('call', (call) => {
          console.log('📱 Call event received:', call);
          if (!call) return;
          const callDirection = getCallDirection(call);
          if (callDirection === 'incoming') {
            handleIncomingCallEventRef.current(call);
            return;
          }
          handleCallStateChangeRef.current(call);
        });
        
        // Pattern 4: Incoming event (some SDK versions)
        client.on('incoming', (call) => {
          console.log('📱 INCOMING CALL via incoming event:', call);
          handleIncomingCallEventRef.current(call);
        });
        
        // Pattern 5: Session events (some SDK versions use session)
        client.on('session', (session) => {
          console.log('📱 Session event:', session);
          if (session && session.direction === 'incoming') {
            console.log('📱 INCOMING CALL via session event:', session);
            handleIncomingCallEventRef.current(session);
          }
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
  }, [getCallDirection]); // Stable - use refs for mutable callbacks/state

  // Save call record to database
  const saveCallRecord = useCallback(async (toNumber, fromNumber, direction = 'outbound', status = 'dialing') => {
    try {
      const response = await API.post('/api/calls', {
        phoneNumber: toNumber,
        fromNumber: fromNumber,
        toNumber: toNumber,
        direction: direction,
        status: status
      });
      
      if (response.error) {
        return {
          callId: null,
          error: response.error,
          status: response.status || 500
        };
      }

      if (response.data?.call?._id) {
        console.log('📱 Call record saved:', response.data.call._id);
        return {
          callId: response.data.call._id,
          error: null,
          status: 200
        };
      }
      return {
        callId: null,
        error: 'Failed to create call record',
        status: 500
      };
    } catch (err) {
      console.warn('📱 Failed to save call record:', err);
      return {
        callId: null,
        error: err?.message || 'Failed to create call record',
        status: 500
      };
    }
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
    console.log('📱 makeCall called with:', { destinationNumber, callerIdNumber });
    console.log('📱 Current state:', { isClientReady: isClientReadyRef.current, hasClient: !!telnyxClientRef.current, callState: callStateRef.current });
    
    const normalizedDestination = normalizeDialableNumber(destinationNumber, { assumeUsForTenDigits: true });

    if (!normalizedDestination) {
      console.log('📱 No destination number');
      setError('Please enter a valid phone number in international format (example: +14155550123).');
      return false;
    }

    try {
      setError(null);
      manualHangupRef.current = false;
      resetOutboundRetryState();
      outboundRetryRef.current.destinationNumber = normalizedDestination;
      outboundRetryRef.current.lastStrategy = "primary";

      const hasMicrophoneAccess = await ensureMicrophonePermission();
      if (!hasMicrophoneAccess) {
        setCallState(CALL_STATES.IDLE);
        resetOutboundRetryState();
        return false;
      }

      await fixPhoneConfiguration();

      setRemoteNumber(normalizedDestination);
      setCallState(CALL_STATES.CONNECTING);
      setIsMinimized(false);

      // Initialize client if needed
      if (!telnyxClientRef.current || !isClientReadyRef.current || !isInitializedRef.current) {
        console.log('📱 Client not ready, initializing...');
        const initialized = await initializeClient();
        console.log('📱 Initialization result:', initialized);
        if (!initialized) {
          console.error('📱 Failed to initialize client');
          setError('Failed to connect to calling service. Please try again.');
          setCallState(CALL_STATES.IDLE);
          resetOutboundRetryState();
          return false;
        }
        // Wait briefly for ready ref to flip (avoid stale state races).
        const readyDeadline = Date.now() + 6000;
        while (!isClientReadyRef.current && Date.now() < readyDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Double check client is available
      if (!telnyxClientRef.current) {
        console.log('📱 Client ref is null after initialization');
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

      // Get caller ID
      let callerId = callerIdNumber;
      if (!callerId && credentials?.callerIdNumber) {
        callerId = credentials.callerIdNumber;
      }

      if (!callerId) {
        console.log('📱 No caller ID available');
        setError('No caller ID available. Please purchase a phone number first.');
        setCallState(CALL_STATES.IDLE);
        resetOutboundRetryState();
        return false;
      }

      const normalizedCallerId = normalizeDialableNumber(callerId, { assumeUsForTenDigits: true });
      if (!normalizedCallerId) {
        setError('Invalid caller ID format. Please use a valid purchased phone number.');
        setCallState(CALL_STATES.IDLE);
        resetOutboundRetryState();
        return false;
      }
      outboundRetryRef.current.originalCallerNumber = normalizedCallerId;

      const stripPlus = (value) => (typeof value === "string" && value.startsWith("+") ? value.slice(1) : value);
      const callerDigits = stripPlus(normalizedCallerId);
      const destinationDigits = stripPlus(normalizedDestination);

      // Fallback strategies for outbound calls that fail before ringing.
      // Telnyx WebRTC environments can differ on whether they accept +E.164 or digits-only.
      // Also, some connections restrict caller IDs; omitting callerNumber can help.
      const fallbackStrategies = [
        {
          label: "caller_id_without_plus",
          destinationNumber: normalizedDestination,
          callerNumber: callerDigits
        },
        {
          label: "destination_and_caller_without_plus",
          destinationNumber: destinationDigits,
          callerNumber: callerDigits
        },
        {
          label: "default_connection_caller",
          destinationNumber: normalizedDestination,
          callerNumber: null
        }
      ].filter((strategy) => {
        if (!strategy?.destinationNumber) return false;
        // Avoid no-op duplicates.
        if (
          strategy.label === "caller_id_without_plus" &&
          callerDigits === normalizedCallerId
        ) {
          return false;
        }
        if (
          strategy.label === "destination_and_caller_without_plus" &&
          destinationDigits === normalizedDestination &&
          callerDigits === normalizedCallerId
        ) {
          return false;
        }
        return true;
      });

      outboundRetryRef.current.retryStrategies = fallbackStrategies;
      outboundRetryRef.current.nextRetryIndex = 0;

      console.log('📱 Placing call from:', normalizedCallerId, 'to:', normalizedDestination);

      // Save call record to database BEFORE making the call
      const callRecordResult = await saveCallRecord(
        normalizedDestination,
        normalizedCallerId,
        'outbound',
        'dialing'
      );
      const callRecordId = callRecordResult.callId;

      if (!callRecordId) {
        setError(
          callRecordResult.error ||
            'SUSPICIOUS ACTIVITY DETECTED. You have reached your daily usage threshold. Please contact support.'
        );
        setCallState(CALL_STATES.IDLE);
        resetOutboundRetryState();
        return false;
      }
      outboundRetryRef.current.callRecordId = callRecordId;

      // Make the call
      const call = telnyxClientRef.current.newCall({
        destinationNumber: normalizedDestination,
        callerNumber: normalizedCallerId,
        audio: true,
        video: false
      });

      console.log('📱 Call object created:', !!call);

      if (!call) {
        setError('Failed to create call');
        setCallState(CALL_STATES.IDLE);
        // Update call record as failed
        if (callRecordId) {
          updateCallRecord(callRecordId, { status: 'failed' });
        }
        resetOutboundRetryState();
        return false;
      }

      currentCallRef.current = call;
      // Store call record ID on the call object for later updates
      call._dbCallId = callRecordId;
      call._usedDefaultCallerFallback = false;

      // Listen for state changes on this call exactly once.
      if (typeof call.on === "function" && !callListenerRegistryRef.current.has(call)) {
        callListenerRegistryRef.current.add(call);
        call.on('stateChange', () => {
          handleCallStateChangeRef.current(call);
        });
      }

      console.log('📱 Call initiated successfully');
      return true;
    } catch (err) {
      console.error('📱 Failed to make call:', err);
      setError(err.message || 'Failed to initiate call');
      setCallState(CALL_STATES.IDLE);
      resetOutboundRetryState();
      return false;
    }
  }, [
    initializeClient,
    credentials,
    saveCallRecord,
    updateCallRecord,
    normalizeDialableNumber,
    ensureMicrophonePermission,
    fixPhoneConfiguration,
    resetOutboundRetryState
  ]); // Removed frequently changing deps

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
    soundManager.stopRingtone();
    manualHangupRef.current = true;
    
    // Close notification if it exists
    if (notificationRef.current) {
      notificationRef.current.close();
      notificationRef.current = null;
    }
    
    // Try to hangup via WebRTC if call object exists
    if (currentCallRef.current) {
      try {
        currentCallRef.current.hangup();
        console.log('📱 Call rejected via WebRTC');
      } catch (e) {
        console.warn('📱 Hangup error:', e);
      }
    }
    
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
    
    handleCallEnd({ finalStatus: "missed" });
  }, [handleCallEnd]);

  // Hang up current call
  const hangUp = useCallback(() => {
    console.log('📱 Hanging up...');
    manualHangupRef.current = true;
    
    if (currentCallRef.current) {
      try {
        currentCallRef.current.hangup();
      } catch (e) {
        console.warn('Hangup error:', e);
      }
    }
    const quickEndFailed =
      callStateRef.current === CALL_STATES.CONNECTING ||
      callStateRef.current === CALL_STATES.RINGING;
    handleCallEnd({ finalStatus: quickEndFailed ? "failed" : "completed" });
  }, [handleCallEnd]);

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
  }, [initializeClient, fixPhoneConfiguration]); // Removed frequently changing deps
  
  // Store polled call ID for answering
  const polledCallIdRef = useRef(null);
  
  // Poll for incoming calls (CRITICAL for Voice API - webhooks create call records, frontend polls to detect them)
  useEffect(() => {
    // Use refs to check state without causing re-renders
    // NOTE: For Voice API, we don't need WebRTC client ready - webhooks create call records, we poll for them
    if (callStateRef.current !== CALL_STATES.IDLE) {
      return; // Don't poll if already handling a call
    }
    
    let lastPolledCallId = null;
    
    const pollForIncomingCalls = async () => {
      // Check refs again inside the polling function
      // For Voice API, we poll even without WebRTC client ready
      if (callStateRef.current !== CALL_STATES.IDLE) {
        return;
      }
      
      try {
        // Check for recent incoming calls that are still ringing
        const response = await API.get('/api/calls?status=ringing&direction=inbound&limit=1');
        if (response.data?.calls && response.data.calls.length > 0) {
          const incomingCall = response.data.calls[0];
          const callId = incomingCall.id || incomingCall._id;
          
          // Only process if this is a new call we haven't seen
          if (callId !== lastPolledCallId) {
            // Check if this call was created in the last 60 seconds
            const callAge = Date.now() - new Date(incomingCall.createdAt || incomingCall.created_at).getTime();
            if (callAge < 60000) { // 60 seconds
              console.log('📱 Polling detected NEW incoming call:', incomingCall);
              lastPolledCallId = callId;
              polledCallIdRef.current = callId; // Store for answering
              
              // Trigger incoming call UI
              setRemoteNumber(incomingCall.fromNumber || incomingCall.phoneNumber);
              setCallState(CALL_STATES.INCOMING);
              setIsMinimized(false);
              soundManager.startRingtone();
              
              // Show browser notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('📞 Incoming Call', {
                  body: `Call from ${incomingCall.fromNumber || incomingCall.phoneNumber}`,
                  icon: '/logo.svg',
                  tag: 'incoming-call-poll',
                  requireInteraction: true
                });
              }
              
              // Try to find the actual WebRTC call object if it exists
              if (telnyxClientRef.current) {
                // The WebRTC client might have the call, try to find it
                // This is a fallback - ideally WebRTC events should fire
                console.log('📱 Polled call detected, WebRTC client should handle it');
              }
            }
          }
        }
      } catch (err) {
        // Silently fail - polling is just a fallback
        console.log('📱 Poll error (non-critical):', err.message);
      }
    };
    
    // Poll every 8 seconds as fallback to reduce API load.
    const pollInterval = setInterval(pollForIncomingCalls, 8000);
    
    // Initial poll after a short delay.
    setTimeout(pollForIncomingCalls, 2500);
    
    return () => clearInterval(pollInterval);
  }, []); // Empty deps - use refs instead

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
