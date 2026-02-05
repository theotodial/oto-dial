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
  const handleCallEnd = useCallback(async () => {
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
          status: 'completed',
          durationSeconds: duration,
          callEndedAt: new Date().toISOString()
        }).then(() => {
          console.log('📱 Call record updated with completion status');
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
        setError(null);
        setIncomingCall(null);
        setIsMinimized(false);
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
      } catch (e) {
        console.error('Critical: Failed to reset call state:', e);
      }
    }
  }, []);

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
    
    // Check if this is an incoming call that we haven't handled yet (use ref)
    if (call.state === 'ringing' && call.direction === 'incoming' && callStateRef.current !== CALL_STATES.INCOMING) {
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
  }, [startDurationTimer, handleCallEnd]); // Removed applyAudioRouting - use ref instead

  // Handle incoming call
  const handleIncomingCallEvent = useCallback((call) => {
    // Prevent duplicate handling (use ref)
    if (callStateRef.current === CALL_STATES.INCOMING && currentCallRef.current === call) {
      console.log('📱 Incoming call already being handled, ignoring duplicate');
      return;
    }
    
    const callerNumber = call.options?.remoteCallerNumber || 
                         call.options?.callerNumber || 
                         call.options?.caller_id_number ||
                         call.remoteCallerNumber ||
                         call.callerNumber ||
                         call.from ||
                         'Unknown';
    
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
    
    // Start WhatsApp-style ringtone immediately
    console.log('📱 Starting incoming call ringtone...');
    soundManager.startRingtone();

    // Show browser notification (even if app is in background)
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          // Close any existing notification
          if (notificationRef.current) {
            notificationRef.current.close();
          }
          
          const notification = new Notification('📞 Incoming Call', {
            body: `Call from ${callerNumber}`,
            icon: '/logo.svg',
            tag: 'incoming-call',
            requireInteraction: true,
            badge: '/logo.svg',
            vibrate: [200, 100, 200] // Vibrate pattern for mobile
          });
          
          notificationRef.current = notification;
          
          // When notification is clicked, ensure call UI is visible
          notification.onclick = () => {
            console.log('📱 Notification clicked - ensuring call UI is visible');
            window.focus();
            
            // Ensure call is not minimized and state is visible
            setIsMinimized(false);
            
            // Always restore/ensure incoming call state is set
            if (currentCallRef.current) {
              console.log('📱 Ensuring incoming call state is visible from notification click');
              setCallState(CALL_STATES.INCOMING);
              setRemoteNumber(callerNumber);
              setIncomingCall(currentCallRef.current);
              setIsMinimized(false); // Explicitly ensure not minimized
            }
            
            // Navigate to recents if not already there
            if (window.location.pathname !== '/recents') {
              window.location.href = '/recents';
            } else {
              // If already on recents, just ensure the UI updates
              // Force a small delay to ensure state updates are processed
              setTimeout(() => {
                setIsMinimized(false);
                if (currentCallRef.current) {
                  setCallState(CALL_STATES.INCOMING);
                  setRemoteNumber(callerNumber);
                }
              }, 100);
            }
            
            notification.close();
            notificationRef.current = null;
          };
        } catch (err) {
          console.warn('Failed to show notification:', err);
        }
      } else if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }

    // Listen for call state changes on this call
    call.on('stateChange', () => {
      console.log('📱 Incoming call state changed:', call.state);
      handleCallStateChangeRef.current(call);
    });
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
            
            // Listen for any incoming calls directly on the client
            // Telnyx SDK may fire incoming call events on the client itself
            if (client.on) {
              // Some SDK versions use different event names
              client.on('incoming', (call) => {
                console.log('📱 Incoming call via client.incoming event:', call);
                handleIncomingCallEventRef.current(call);
              });
              
              client.on('call', (call) => {
                console.log('📱 Call event via client.call:', call);
                if (call.direction === 'incoming' || call.state === 'ringing') {
                  handleIncomingCallEventRef.current(call);
                }
              });
            }
            
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
          if (call && (call.direction === 'incoming' || call.state === 'ringing')) {
            console.log('📱 INCOMING CALL via call event:', call);
            handleIncomingCallEventRef.current(call);
          } else if (call) {
            handleCallStateChangeRef.current(call);
          }
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
        
        // Pattern 6: Listen for ANY event that might be an incoming call
        // This is a catch-all for debugging
        const originalEmit = client.emit;
        client.emit = function(...args) {
          console.log('📱 Client emit:', args[0], args[1]);
          if (args[0] && (args[0].includes('incoming') || args[0].includes('call'))) {
            console.log('📱 Potential incoming call event:', args);
          }
          return originalEmit.apply(this, args);
        };
        
        // Also listen for socket messages that might contain incoming call info
        client.on('telnyx.socket.message', (message) => {
          console.log('📱 Socket message:', message);
          if (message && (message.type === 'incoming' || message.direction === 'incoming')) {
            console.log('📱 INCOMING CALL via socket message:', message);
            // Try to create a call object from the message
            if (message.call) {
              handleIncomingCallEventRef.current(message.call);
            }
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
  }, []); // Stable - use refs for callbacks and state

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
      
      if (response.data?.call?._id) {
        console.log('📱 Call record saved:', response.data.call._id);
        return response.data.call._id;
      }
      return null;
    } catch (err) {
      console.warn('📱 Failed to save call record:', err);
      return null;
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

  // Make outbound call
  const makeCall = useCallback(async (destinationNumber, callerIdNumber) => {
    console.log('📱 makeCall called with:', { destinationNumber, callerIdNumber });
    console.log('📱 Current state:', { isClientReady, hasClient: !!telnyxClientRef.current, callState: callStateRef.current });
    
    if (!destinationNumber) {
      console.log('📱 No destination number');
      setError('Please enter a phone number');
      return false;
    }

    try {
      setError(null);
      setRemoteNumber(destinationNumber);
      setCallState(CALL_STATES.CONNECTING);
      setIsMinimized(false);

      // Initialize client if needed
      if (!telnyxClientRef.current || !isClientReady) {
        console.log('📱 Client not ready, initializing...');
        const initialized = await initializeClient();
        console.log('📱 Initialization result:', initialized);
        if (!initialized) {
          console.error('📱 Failed to initialize client');
          setError('Failed to connect to calling service. Please try again.');
          setCallState(CALL_STATES.IDLE);
          return false;
        }
        // Small delay to ensure client is fully ready
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Double check client is available
      if (!telnyxClientRef.current) {
        console.log('📱 Client ref is null after initialization');
        setError('Calling service not available');
        setCallState(CALL_STATES.IDLE);
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
        return false;
      }

      console.log('📱 Placing call from:', callerId, 'to:', destinationNumber);

      // Save call record to database BEFORE making the call
      const callRecordId = await saveCallRecord(destinationNumber, callerId, 'outbound', 'dialing');

      // Make the call
      const call = telnyxClientRef.current.newCall({
        destinationNumber: destinationNumber,
        callerNumber: callerId,
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
        return false;
      }

      currentCallRef.current = call;
      // Store call record ID on the call object for later updates
      call._dbCallId = callRecordId;

      // Listen for state changes on this call
      call.on('stateChange', () => {
        console.log('📱 Outbound call state:', call.state);
        handleCallStateChangeRef.current(call);
      });

      console.log('📱 Call initiated successfully');
      return true;
    } catch (err) {
      console.error('📱 Failed to make call:', err);
      setError(err.message || 'Failed to initiate call');
      setCallState(CALL_STATES.IDLE);
      return false;
    }
  }, [initializeClient, credentials, saveCallRecord, updateCallRecord]); // Removed frequently changing deps

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
    
    handleCallEnd();
  }, [handleCallEnd]);

  // Hang up current call
  const hangUp = useCallback(() => {
    console.log('📱 Hanging up...');
    
    if (currentCallRef.current) {
      try {
        currentCallRef.current.hangup();
      } catch (e) {
        console.warn('Hangup error:', e);
      }
    }
    handleCallEnd();
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

  // Fix voice and messaging configuration for phone numbers
  const fixPhoneConfiguration = useCallback(async () => {
    try {
      console.log('📱 Checking and fixing phone configuration...');
      const response = await API.post('/api/numbers/fix-all');
      if (response.data?.success) {
        console.log('✅ Phone configuration fixed:', response.data);
      }
      
      // Also check WebRTC status for debugging
      try {
        const statusResponse = await API.get('/api/webrtc/status');
        if (statusResponse.data?.status) {
          console.log('📱 WebRTC Status:', statusResponse.data.status);
          console.log('📱 Instructions:', statusResponse.data.status.instructions);
        }
      } catch (statusErr) {
        console.log('📱 Could not fetch WebRTC status:', statusErr.message);
      }
    } catch (err) {
      // Silently fail - this is just a best-effort fix
      console.log('📱 Phone config fix skipped:', err.message);
    }
  }, []);

  // Auto-initialize client when component mounts (for receiving calls)
  useEffect(() => {
    const autoInit = async () => {
      const token = localStorage.getItem('token');
      if (token && !isClientReady && !isInitializing && !isInitializedRef.current) {
        console.log('📱 Auto-initializing WebRTC client for incoming calls...');
        
        // First, try to fix phone configuration
        await fixPhoneConfiguration();
        
        // Then initialize the WebRTC client
        setTimeout(() => {
          initializeClient().catch(e => {
            console.log('📱 Auto-init failed:', e.message);
          });
        }, 1500);
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
  }, [fixPhoneConfiguration, initializeClient]); // Removed frequently changing deps
  
  // Store polled call ID for answering
  const polledCallIdRef = useRef(null);
  
  // Poll for incoming calls (CRITICAL for Voice API - webhooks create call records, frontend polls to detect them)
  useEffect(() => {
    // Use refs to check state without causing re-renders
    // NOTE: For Voice API, we don't need WebRTC client ready - webhooks create call records, we poll for them
    if (callStateRef.current === CALL_STATES.INCOMING || callStateRef.current === CALL_STATES.ACTIVE) {
      return; // Don't poll if already handling a call
    }
    
    let lastPolledCallId = null;
    
    const pollForIncomingCalls = async () => {
      // Check refs again inside the polling function
      // For Voice API, we poll even without WebRTC client ready
      if (callStateRef.current === CALL_STATES.INCOMING || callStateRef.current === CALL_STATES.ACTIVE) {
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
    
    // Poll every 5 seconds as fallback (reduced frequency to improve performance)
    const pollInterval = setInterval(pollForIncomingCalls, 5000);
    
    // Initial poll after 2 seconds
    setTimeout(pollForIncomingCalls, 2000);
    
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
