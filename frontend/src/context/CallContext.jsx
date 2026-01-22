import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import API from "../api";
import { useAuth } from "./AuthContext";

const CallContext = createContext(null);

const ACTIVE_STATUSES = new Set(["queued", "dialing", "ringing", "in-progress", "answered"]);

const getDisplayNumber = (call) => {
  if (!call) return "";
  if (call.direction === "inbound") {
    return call.fromNumber || call.phoneNumber || "";
  }
  return call.toNumber || call.phoneNumber || "";
};

export function CallProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [callState, setCallState] = useState({
    status: "idle",
    direction: null,
    phoneNumber: "",
    callId: null,
    callControlId: null,
    startedAt: null,
    error: ""
  });
  const [isPlacingCall, setIsPlacingCall] = useState(false);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [showDialpad, setShowDialpad] = useState(false);
  const notifiedRef = useRef(new Set());
  const localStreamRef = useRef(null);

  const isActive = ACTIVE_STATUSES.has(callState.status);
  const isIncoming = callState.direction === "inbound" && callState.status === "ringing";

  const resetCallState = () => {
    setCallState({
      status: "idle",
      direction: null,
      phoneNumber: "",
      callId: null,
      callControlId: null,
      startedAt: null,
      error: ""
    });
    setDuration(0);
    setMuted(false);
    setSpeakerOn(false);
    setOnHold(false);
    setShowDialpad(false);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  const setCallFromApi = (call) => {
    if (!call) {
      if (isActive) {
        resetCallState();
      }
      return;
    }

    const nextStatus = call.status || "dialing";
    const nextDirection = call.direction || "outbound";
    const displayNumber = getDisplayNumber(call);

    const controlIdChanged =
      call.telnyxCallControlId && call.telnyxCallControlId !== callState.callControlId;

    setCallState((prev) => {
      const isNewCall =
        call.telnyxCallControlId && prev.callControlId && call.telnyxCallControlId !== prev.callControlId;
      return {
        ...prev,
        status: nextStatus,
        direction: nextDirection,
        phoneNumber: displayNumber,
        callId: call._id || prev.callId,
        callControlId: call.telnyxCallControlId || prev.callControlId,
        startedAt: call.callStartedAt ? new Date(call.callStartedAt) : isNewCall ? null : prev.startedAt,
        error: ""
      };
    });

    if (controlIdChanged) {
      setDuration(0);
      setMuted(false);
      setSpeakerOn(false);
      setOnHold(false);
      setShowDialpad(false);
    }
  };

  const requestMicrophone = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is not supported on this device.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    return stream;
  };

  const startCall = async (destination) => {
    if (!destination) return { success: false, error: "Phone number required." };
    if (isPlacingCall) return { success: false, error: "Call already in progress." };

    setIsPlacingCall(true);
    setCallState((prev) => ({ ...prev, error: "" }));

    try {
      await requestMicrophone();
    } catch (err) {
      setCallState((prev) => ({
        ...prev,
        error: "Microphone access is required to make calls."
      }));
      setIsPlacingCall(false);
      return {
        success: false,
        error: "Microphone access is required to make calls."
      };
    }

    const response = await API.post("/api/dialer/call", { to: destination });
    if (response.error) {
      setCallState((prev) => ({ ...prev, error: response.error }));
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      setIsPlacingCall(false);
      return { success: false, error: response.error };
    }

    setCallState({
      status: "dialing",
      direction: "outbound",
      phoneNumber: destination,
      callId: response.data?.callId || null,
      callControlId: response.data?.callControlId || null,
      startedAt: null,
      error: ""
    });

    setIsPlacingCall(false);
    return { success: true };
  };

  const answerCall = async () => {
    if (!callState.callControlId) return { success: false, error: "No call to answer." };
    try {
      await requestMicrophone();
    } catch (err) {
      setCallState((prev) => ({
        ...prev,
        error: "Microphone access is required to answer calls."
      }));
      return { success: false, error: "Microphone access is required to answer calls." };
    }
    const response = await API.post(`/api/dialer/call/${callState.callControlId}/answer`);
    if (response.error) {
      setCallState((prev) => ({ ...prev, error: response.error }));
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      return { success: false, error: response.error };
    }
    setCallState((prev) => ({
      ...prev,
      status: "in-progress",
      startedAt: prev.startedAt || new Date()
    }));
    return { success: true };
  };

  const endCall = async () => {
    if (!callState.callControlId) {
      resetCallState();
      return { success: true };
    }
    const response = await API.post(`/api/dialer/call/${callState.callControlId}/hangup`);
    if (response.error) {
      setCallState((prev) => ({ ...prev, error: response.error }));
      return { success: false, error: response.error };
    }
    resetCallState();
    return { success: true };
  };

  // Poll active call status for inbound + updates
  useEffect(() => {
    if (!isAuthenticated) {
      resetCallState();
      return;
    }

    let isMounted = true;
    const poll = async () => {
      const response = await API.get("/api/dialer/active");
      if (!isMounted) return;
      if (response.error) return;
      setCallFromApi(response.data?.call || null);
    };

    poll();
    const intervalMs = isActive ? 2500 : 6000;
    const interval = setInterval(poll, intervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, isActive]);

  // Track call duration
  useEffect(() => {
    if (!isActive || callState.status !== "in-progress") {
      setDuration(0);
      return;
    }

    const startedAt = callState.startedAt ? new Date(callState.startedAt) : new Date();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      setDuration(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, callState.status, callState.startedAt]);

  // Incoming call notifications (best effort)
  useEffect(() => {
    if (!isIncoming || !callState.callId) return;
    if (notifiedRef.current.has(callState.callId)) return;

    notifiedRef.current.add(callState.callId);

    if (!("Notification" in window)) return;

    const showNotification = () => {
      try {
        const notification = new Notification("Incoming call", {
          body: `Call from ${callState.phoneNumber || "Unknown number"}`,
          tag: `incoming-call-${callState.callId}`
        });
        notification.onclick = () => window.focus();
      } catch (err) {
        console.warn("Failed to show notification:", err);
      }
    };

    if (Notification.permission === "granted") {
      showNotification();
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          showNotification();
        }
      });
    }
  }, [isIncoming, callState.callId, callState.phoneNumber]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !next;
        });
      }
      return next;
    });
  };

  const value = useMemo(
    () => ({
      callState,
      duration,
      isActive,
      isIncoming,
      isPlacingCall,
      muted,
      speakerOn,
      onHold,
      showDialpad,
      setShowDialpad,
      toggleMute,
      toggleSpeaker: () => setSpeakerOn((prev) => !prev),
      toggleHold: () => setOnHold((prev) => !prev),
      startCall,
      answerCall,
      endCall,
      resetCallState
    }),
    [
      callState,
      duration,
      isActive,
      isIncoming,
      isPlacingCall,
      muted,
      speakerOn,
      onHold,
      showDialpad,
      toggleMute
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  return useContext(CallContext);
}
