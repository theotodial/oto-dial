import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import API from '../api';

const CallContext = createContext(null);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};

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
  const [callControlId, setCallControlId] = useState(null);

  // Refs
  const durationIntervalRef = useRef(null);
  const localStreamRef = useRef(null);
  const callStateRef = useRef(callState);
  
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

  // Start duration timer
  const startDurationTimer = useCallback(() => {
    setCallDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  // End call cleanup
  const endCallCleanup = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop local microphone stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setCallState(CALL_STATES.IDLE);
    setCallDuration(0);
    setIsMuted(false);
    setIsOnHold(false);
    setRemoteNumber('');
    setCallControlId(null);
    setError(null);
    setIncomingCall(null);
  }, []);

  // Initialize client (placeholder for WebRTC - currently just returns true)
  const initializeClient = useCallback(async () => {
    // WebRTC would be initialized here if available
    // For now, we use API-based calling
    return true;
  }, []);

  // Make outbound call using API
  const makeCall = useCallback(async (destinationNumber, callerIdNumber) => {
    try {
      setError(null);
      
      // Request microphone permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
      } catch (micError) {
        setError('Microphone access is required to make calls');
        return false;
      }

      setRemoteNumber(destinationNumber);
      setCallState(CALL_STATES.CONNECTING);

      // Make API call to initiate the call
      const response = await API.post('/api/dialer/call', { to: destinationNumber });
      
      if (response.error) {
        setError(response.error);
        setCallState(CALL_STATES.IDLE);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        return false;
      }

      // Store call control ID for later operations
      if (response.data?.callControlId) {
        setCallControlId(response.data.callControlId);
      }

      // Transition to ringing state
      setCallState(CALL_STATES.RINGING);
      
      // Simulate call being answered after a delay
      // In production, this would be handled by webhooks
      setTimeout(() => {
        if (callStateRef.current === CALL_STATES.RINGING) {
          setCallState(CALL_STATES.ACTIVE);
          startDurationTimer();
        }
      }, 3000);

      return true;
    } catch (err) {
      console.error('Failed to make call:', err);
      setError('Failed to initiate call');
      setCallState(CALL_STATES.IDLE);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      return false;
    }
  }, [startDurationTimer]);

  // Answer incoming call
  const answerCall = useCallback(() => {
    if (incomingCall) {
      setCallState(CALL_STATES.ACTIVE);
      setIncomingCall(null);
      startDurationTimer();
    }
  }, [incomingCall, startDurationTimer]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    if (incomingCall) {
      endCallCleanup();
    }
  }, [incomingCall, endCallCleanup]);

  // Hang up current call
  const hangUp = useCallback(async () => {
    // If we have a call control ID, try to end the call via API
    if (callControlId) {
      try {
        await API.post('/api/dialer/hangup', { callControlId });
      } catch (err) {
        console.warn('Failed to send hangup command:', err);
      }
    }
    endCallCleanup();
  }, [callControlId, endCallCleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted; // Toggle: if muted, enable; if not muted, disable
      }
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Toggle hold
  const toggleHold = useCallback(() => {
    if (isOnHold) {
      setCallState(CALL_STATES.ACTIVE);
    } else {
      setCallState(CALL_STATES.HELD);
    }
    setIsOnHold(!isOnHold);
  }, [isOnHold]);

  // Toggle speaker
  const toggleSpeaker = useCallback(() => {
    setIsSpeaker(!isSpeaker);
  }, [isSpeaker]);

  // Send DTMF
  const sendDTMF = useCallback((digit) => {
    // DTMF would be sent via API or WebRTC
    console.log('DTMF:', digit);
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
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
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
