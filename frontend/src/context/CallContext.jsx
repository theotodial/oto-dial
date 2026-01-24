import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { TelnyxRTC } from '@telnyx/webrtc';
import API from '../api';

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
    // Return a safe default object instead of throwing
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

// Audio manager for call sounds
class CallAudioManager {
  constructor() {
    this.audioContext = null;
    this.ringbackInterval = null;
    this.ringtoneInterval = null;
  }

  getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }

  // Play a tone using Web Audio API
  playTone(frequency, duration, type = 'sine') {
    try {
      const ctx = this.getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Could not play tone:', e);
    }
  }

  // US ringback tone: 440Hz + 480Hz for 2s, silence for 4s
  startRingback() {
    this.stopRingback();
    const playRingback = () => {
      this.playTone(440, 0.5);
      setTimeout(() => this.playTone(480, 0.5), 50);
    };
    playRingback();
    this.ringbackInterval = setInterval(playRingback, 4000);
  }

  stopRingback() {
    if (this.ringbackInterval) {
      clearInterval(this.ringbackInterval);
      this.ringbackInterval = null;
    }
  }

  // Incoming call ringtone: iPhone-like pattern
  startRingtone() {
    this.stopRingtone();
    const playRing = () => {
      // Play a pleasant two-tone ring
      const frequencies = [784, 659, 784, 659]; // G5, E5 alternating
      frequencies.forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 0.15), i * 200);
      });
    };
    playRing();
    this.ringtoneInterval = setInterval(playRing, 2500);
  }

  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  // Call connected sound
  playConnected() {
    this.playTone(1200, 0.1);
    setTimeout(() => this.playTone(1400, 0.1), 100);
  }

  // Call ended sound
  playEnded() {
    this.playTone(400, 0.2);
    setTimeout(() => this.playTone(300, 0.3), 200);
  }

  // Button press sound
  playDTMF(digit) {
    const dtmfFrequencies = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
    };
    const freqs = dtmfFrequencies[digit];
    if (freqs) {
      this.playTone(freqs[0], 0.15);
      this.playTone(freqs[1], 0.15);
    }
  }

  stopAll() {
    this.stopRingback();
    this.stopRingtone();
  }
}

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

  // Refs
  const telnyxClientRef = useRef(null);
  const currentCallRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const audioManagerRef = useRef(new CallAudioManager());
  const callStateRef = useRef(callState);
  const remoteAudioRef = useRef(null);
  
  // Keep ref in sync with state
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

  // Fetch WebRTC credentials
  const fetchCredentials = useCallback(async () => {
    try {
      const response = await API.get('/api/webrtc/token');
      if (response.data?.credentials) {
        setCredentials(response.data.credentials);
        return response.data.credentials;
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch WebRTC credentials:', err);
      return null;
    }
  }, []);

  // Initialize Telnyx WebRTC client
  const initializeClient = useCallback(async () => {
    console.log('📱 Initializing Telnyx WebRTC client...');
    
    // If already connected, return true
    if (telnyxClientRef.current && isClientReady) {
      console.log('📱 Client already ready');
      return true;
    }

    try {
      // Get credentials from backend
      let creds = credentials;
      if (!creds) {
        creds = await fetchCredentials();
      }
      
      if (!creds) {
        setError('Failed to get WebRTC credentials');
        return false;
      }

      // Get SIP password from frontend env
      const sipPassword = import.meta.env.VITE_TELNYX_SIP_PASSWORD;
      if (!sipPassword) {
        console.error('Missing VITE_TELNYX_SIP_PASSWORD in frontend .env');
        setError('SIP password not configured');
        return false;
      }

      console.log('📱 Creating TelnyxRTC client with username:', creds.sipUsername);

      // Create Telnyx WebRTC client
      const client = new TelnyxRTC({
        login: creds.sipUsername,
        password: sipPassword,
        ringtoneFile: null, // We handle our own sounds
        ringbackFile: null,
      });

      // Set up event handlers
      client.on('telnyx.ready', () => {
        console.log('✅ Telnyx WebRTC client ready');
        setIsClientReady(true);
        setError(null);
      });

      client.on('telnyx.error', (error) => {
        console.error('❌ Telnyx error:', error);
        setError(error.message || 'Connection error');
        setIsClientReady(false);
      });

      client.on('telnyx.socket.close', () => {
        console.log('📱 Telnyx socket closed');
        setIsClientReady(false);
      });

      client.on('telnyx.notification', (notification) => {
        console.log('📱 Telnyx notification:', notification);
        handleNotification(notification);
      });

      // Connect to Telnyx
      await client.connect();
      telnyxClientRef.current = client;

      return true;
    } catch (err) {
      console.error('Failed to initialize Telnyx client:', err);
      setError('Failed to connect to calling service');
      return false;
    }
  }, [credentials, fetchCredentials, isClientReady]);

  // Handle Telnyx notifications (incoming calls, call state changes)
  const handleNotification = useCallback((notification) => {
    const call = notification.call;
    
    if (!call) return;

    console.log('📱 Call notification:', notification.type, call.state);

    switch (notification.type) {
      case 'callUpdate':
        handleCallUpdate(call);
        break;
      case 'incomingCall':
        handleIncomingCall(call);
        break;
    }
  }, []);

  // Handle call state updates
  const handleCallUpdate = useCallback((call) => {
    console.log('📱 Call state update:', call.state);
    currentCallRef.current = call;

    // Attach remote audio stream
    if (call.remoteStream && remoteAudioRef.current) {
      if (remoteAudioRef.current.srcObject !== call.remoteStream) {
        remoteAudioRef.current.srcObject = call.remoteStream;
        remoteAudioRef.current.play().catch(e => console.warn('Audio play failed:', e));
      }
    }

    switch (call.state) {
      case 'trying':
      case 'requesting':
        setCallState(CALL_STATES.CONNECTING);
        break;
      case 'ringing':
      case 'early':
        setCallState(CALL_STATES.RINGING);
        audioManagerRef.current.startRingback();
        break;
      case 'active':
        setCallState(CALL_STATES.ACTIVE);
        audioManagerRef.current.stopRingback();
        audioManagerRef.current.playConnected();
        startDurationTimer();
        break;
      case 'held':
        setCallState(CALL_STATES.HELD);
        break;
      case 'hangup':
      case 'destroy':
      case 'bye':
        endCallCleanup();
        break;
    }
  }, []);

  // Handle incoming calls
  const handleIncomingCall = useCallback((call) => {
    console.log('📱 Incoming call from:', call.options?.remoteCallerNumber);
    currentCallRef.current = call;
    setRemoteNumber(call.options?.remoteCallerNumber || 'Unknown');
    setCallState(CALL_STATES.INCOMING);
    setIncomingCall(call);
    audioManagerRef.current.startRingtone();

    // Show browser notification if allowed
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Incoming Call', {
        body: `Call from ${call.options?.remoteCallerNumber || 'Unknown'}`,
        icon: '/logo.svg',
        tag: 'incoming-call',
        requireInteraction: true
      });
    }
  }, []);

  // Start duration timer
  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  // End call cleanup
  const endCallCleanup = useCallback(() => {
    console.log('📱 Cleaning up call...');
    audioManagerRef.current.stopAll();
    audioManagerRef.current.playEnded();

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

  // Make outbound call
  const makeCall = useCallback(async (destinationNumber, callerIdNumber) => {
    console.log('📱 Making call to:', destinationNumber);
    
    try {
      setError(null);

      // Initialize client if needed
      if (!telnyxClientRef.current || !isClientReady) {
        const initialized = await initializeClient();
        if (!initialized) {
          return false;
        }
        // Wait a moment for client to be fully ready
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!telnyxClientRef.current) {
        setError('Calling service not available');
        return false;
      }

      setRemoteNumber(destinationNumber);
      setCallState(CALL_STATES.CONNECTING);

      // Get credentials for caller ID
      let creds = credentials;
      if (!creds) {
        creds = await fetchCredentials();
      }

      // Make the call using Telnyx WebRTC
      const call = telnyxClientRef.current.newCall({
        destinationNumber: destinationNumber,
        callerNumber: callerIdNumber || creds?.callerIdNumber,
        audio: true,
        video: false
      });

      currentCallRef.current = call;
      console.log('📱 Call initiated');

      return true;
    } catch (err) {
      console.error('Failed to make call:', err);
      setError('Failed to initiate call');
      setCallState(CALL_STATES.IDLE);
      return false;
    }
  }, [initializeClient, isClientReady, credentials, fetchCredentials]);

  // Answer incoming call
  const answerCall = useCallback(() => {
    console.log('📱 Answering call...');
    audioManagerRef.current.stopRingtone();
    
    if (currentCallRef.current) {
      currentCallRef.current.answer();
      setIncomingCall(null);
    }
  }, []);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    console.log('📱 Rejecting call...');
    audioManagerRef.current.stopRingtone();
    
    if (currentCallRef.current) {
      currentCallRef.current.hangup();
    }
    endCallCleanup();
  }, [endCallCleanup]);

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
    endCallCleanup();
  }, [endCallCleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (currentCallRef.current) {
      if (isMuted) {
        currentCallRef.current.unmuteAudio();
      } else {
        currentCallRef.current.muteAudio();
      }
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Toggle hold
  const toggleHold = useCallback(() => {
    if (currentCallRef.current) {
      if (isOnHold) {
        currentCallRef.current.unhold();
      } else {
        currentCallRef.current.hold();
      }
    }
    setIsOnHold(!isOnHold);
  }, [isOnHold]);

  // Toggle speaker
  const toggleSpeaker = useCallback(() => {
    // Speaker mode is typically handled by the device, but we can track state
    setIsSpeaker(!isSpeaker);
  }, [isSpeaker]);

  // Send DTMF
  const sendDTMF = useCallback((digit) => {
    console.log('📱 Sending DTMF:', digit);
    audioManagerRef.current.playDTMF(digit);
    
    if (currentCallRef.current) {
      currentCallRef.current.dtmf(digit);
    }
  }, []);

  // Format duration
  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      audioManagerRef.current.stopAll();
      if (telnyxClientRef.current) {
        try {
          telnyxClientRef.current.disconnect();
        } catch (e) {
          console.warn('Disconnect error:', e);
        }
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
