import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import API from '../api';
import soundManager from '../utils/sounds';

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

  // Refs
  const telnyxClientRef = useRef(null);
  const currentCallRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const callStateRef = useRef(callState);
  const remoteAudioRef = useRef(null);
  const initializationPromiseRef = useRef(null);
  
  // Keep refs in sync with state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Create hidden audio element for remote audio
  useEffect(() => {
    if (!remoteAudioRef.current) {
      const audio = document.createElement('audio');
      audio.id = 'telnyx-remote-audio';
      audio.autoplay = true;
      audio.playsInline = true;
      document.body.appendChild(audio);
      remoteAudioRef.current = audio;
    }
    return () => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
        remoteAudioRef.current.remove();
        remoteAudioRef.current = null;
      }
    };
  }, []);

  // Handle call state updates from Telnyx
  const handleCallStateChange = useCallback((call) => {
    if (!call) return;
    
    console.log('📱 Call state changed:', call.state);
    currentCallRef.current = call;

    // Attach remote audio stream when available
    if (call.remoteStream && remoteAudioRef.current) {
      if (remoteAudioRef.current.srcObject !== call.remoteStream) {
        console.log('📱 Attaching remote audio stream');
        remoteAudioRef.current.srcObject = call.remoteStream;
        remoteAudioRef.current.play().catch(e => console.warn('Audio play failed:', e));
      }
    }

    switch (call.state) {
      case 'new':
      case 'trying':
      case 'requesting':
        setCallState(CALL_STATES.CONNECTING);
        break;
      case 'ringing':
      case 'early':
        setCallState(CALL_STATES.RINGING);
        soundManager.startRingback();
        break;
      case 'active':
        setCallState(CALL_STATES.ACTIVE);
        soundManager.stopRingback();
        soundManager.stopRingtone();
        soundManager.playConnected();
        startDurationTimer();
        break;
      case 'held':
        setCallState(CALL_STATES.HELD);
        break;
      case 'hangup':
      case 'destroy':
      case 'done':
      case 'purge':
        handleCallEnd();
        break;
    }
  }, []);

  // Handle incoming call
  const handleIncomingCallEvent = useCallback((call) => {
    console.log('📱 Incoming call from:', call.options?.remoteCallerNumber || call.options?.callerNumber);
    currentCallRef.current = call;
    
    const callerNumber = call.options?.remoteCallerNumber || 
                         call.options?.callerNumber || 
                         call.options?.caller_id_number ||
                         'Unknown';
    
    setRemoteNumber(callerNumber);
    setCallState(CALL_STATES.INCOMING);
    setIncomingCall(call);
    
    // Start ringtone
    soundManager.startRingtone();

    // Show browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('📞 Incoming Call', {
        body: `Call from ${callerNumber}`,
        icon: '/logo.svg',
        tag: 'incoming-call',
        requireInteraction: true,
        vibrate: [200, 100, 200]
      });
    }

    // Listen for call state changes on this call
    call.on('stateChange', (state) => {
      console.log('📱 Incoming call state change:', state);
      handleCallStateChange(call);
    });
  }, [handleCallStateChange]);

  // Handle call end
  const handleCallEnd = useCallback(() => {
    console.log('📱 Call ended, cleaning up...');
    soundManager.stopAll();
    soundManager.playEnded();

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    currentCallRef.current = null;
    setCallState(CALL_STATES.IDLE);
    setCallDuration(0);
    setIsMuted(false);
    setIsOnHold(false);
    setRemoteNumber('');
    setError(null);
    setIncomingCall(null);
  }, []);

  // Start call duration timer
  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  // Initialize Telnyx WebRTC client
  const initializeClient = useCallback(async () => {
    // If already initializing, wait for that to complete
    if (initializationPromiseRef.current) {
      console.log('📱 Already initializing, waiting...');
      return initializationPromiseRef.current;
    }

    // If already connected, return true
    if (telnyxClientRef.current && isClientReady) {
      console.log('📱 Client already ready');
      return true;
    }

    setIsInitializing(true);
    
    initializationPromiseRef.current = (async () => {
      try {
        console.log('📱 Initializing Telnyx WebRTC client...');
        
        // Get credentials from backend
        let creds = credentials;
        if (!creds) {
          const response = await API.get('/api/webrtc/token');
          if (response.data?.credentials) {
            creds = response.data.credentials;
            setCredentials(creds);
          }
        }
        
        if (!creds) {
          console.error('Failed to get WebRTC credentials');
          setError('Failed to get calling credentials');
          return false;
        }

        // Get SIP password from frontend env
        const sipPassword = import.meta.env.VITE_TELNYX_SIP_PASSWORD;
        if (!sipPassword) {
          console.error('Missing VITE_TELNYX_SIP_PASSWORD');
          setError('Calling not configured properly');
          return false;
        }

        console.log('📱 Creating TelnyxRTC client with username:', creds.sipUsername);

        // Disconnect existing client if any
        if (telnyxClientRef.current) {
          try {
            telnyxClientRef.current.disconnect();
          } catch (e) {}
        }

        // Create new Telnyx WebRTC client
        const client = new TelnyxRTC({
          login: creds.sipUsername,
          password: sipPassword,
          ringtoneFile: null,
          ringbackFile: null,
        });

        // Set up event handlers
        client.on('telnyx.ready', () => {
          console.log('✅ Telnyx WebRTC client ready!');
          setIsClientReady(true);
          setError(null);
          setIsInitializing(false);
        });

        client.on('telnyx.error', (err) => {
          console.error('❌ Telnyx error:', err);
          setError(err.message || 'Connection error');
          setIsClientReady(false);
          setIsInitializing(false);
        });

        client.on('telnyx.socket.close', () => {
          console.log('📱 Telnyx socket closed');
          setIsClientReady(false);
        });

        // Handle incoming calls
        client.on('telnyx.notification', (notification) => {
          console.log('📱 Telnyx notification:', notification.type);
          
          if (notification.type === 'callUpdate' && notification.call) {
            handleCallStateChange(notification.call);
          }
          
          if (notification.type === 'incomingCall' && notification.call) {
            handleIncomingCallEvent(notification.call);
          }
        });

        // Connect to Telnyx
        await client.connect();
        telnyxClientRef.current = client;

        // Wait for ready event with timeout
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);
          
          const checkReady = () => {
            if (client.connected) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });

        console.log('✅ Telnyx client connected and ready');
        return true;
      } catch (err) {
        console.error('Failed to initialize Telnyx client:', err);
        setError('Failed to connect to calling service');
        setIsInitializing(false);
        return false;
      } finally {
        initializationPromiseRef.current = null;
      }
    })();

    return initializationPromiseRef.current;
  }, [credentials, isClientReady, handleCallStateChange, handleIncomingCallEvent]);

  // Make outbound call
  const makeCall = useCallback(async (destinationNumber, callerIdNumber) => {
    console.log('📱 Making call to:', destinationNumber);
    
    try {
      setError(null);
      setRemoteNumber(destinationNumber);
      setCallState(CALL_STATES.CONNECTING);

      // Initialize client if needed
      if (!telnyxClientRef.current || !isClientReady) {
        console.log('📱 Client not ready, initializing...');
        const initialized = await initializeClient();
        if (!initialized) {
          setCallState(CALL_STATES.IDLE);
          return false;
        }
      }

      // Double check client is available
      if (!telnyxClientRef.current) {
        setError('Calling service not available');
        setCallState(CALL_STATES.IDLE);
        return false;
      }

      // Get caller ID
      let callerId = callerIdNumber;
      if (!callerId && credentials?.callerIdNumber) {
        callerId = credentials.callerIdNumber;
      }

      console.log('📱 Placing call from:', callerId, 'to:', destinationNumber);

      // Make the call
      const call = telnyxClientRef.current.newCall({
        destinationNumber: destinationNumber,
        callerNumber: callerId,
        audio: true,
        video: false
      });

      if (!call) {
        setError('Failed to create call');
        setCallState(CALL_STATES.IDLE);
        return false;
      }

      currentCallRef.current = call;

      // Listen for state changes on this call
      call.on('stateChange', (state) => {
        console.log('📱 Outbound call state:', state);
        handleCallStateChange(call);
      });

      console.log('📱 Call initiated successfully');
      return true;
    } catch (err) {
      console.error('Failed to make call:', err);
      setError(err.message || 'Failed to initiate call');
      setCallState(CALL_STATES.IDLE);
      return false;
    }
  }, [initializeClient, isClientReady, credentials, handleCallStateChange]);

  // Answer incoming call
  const answerCall = useCallback(() => {
    console.log('📱 Answering call...');
    soundManager.stopRingtone();
    
    if (currentCallRef.current) {
      try {
        currentCallRef.current.answer();
        setIncomingCall(null);
        setCallState(CALL_STATES.ACTIVE);
        startDurationTimer();
      } catch (e) {
        console.error('Failed to answer call:', e);
        setError('Failed to answer call');
      }
    }
  }, [startDurationTimer]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    console.log('📱 Rejecting call...');
    soundManager.stopRingtone();
    
    if (currentCallRef.current) {
      try {
        currentCallRef.current.hangup();
      } catch (e) {}
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

  // Toggle speaker
  const toggleSpeaker = useCallback(() => {
    setIsSpeaker(!isSpeaker);
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

  // Auto-initialize client when component mounts (for receiving calls)
  useEffect(() => {
    const autoInit = async () => {
      // Check if user has a token (is logged in)
      const token = localStorage.getItem('token');
      if (token && !isClientReady && !isInitializing) {
        console.log('📱 Auto-initializing WebRTC client for incoming calls...');
        // Small delay to let other components mount
        setTimeout(() => {
          initializeClient().catch(e => {
            console.log('📱 Auto-init skipped (no subscription or credentials)');
          });
        }, 2000);
      }
    };
    
    autoInit();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      soundManager.stopAll();
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
