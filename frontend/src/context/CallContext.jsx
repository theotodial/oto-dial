import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { TelnyxRTC, SwEvent } from "@telnyx/webrtc";
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

const getRtcDisplayNumber = (call) => {
  if (!call) return "";
  const options = call.options || {};
  const direction = String(call.direction || "").toLowerCase();
  if (direction === "inbound") {
    return (
      options.remoteCallerNumber ||
      options.callerNumber ||
      options.destinationNumber ||
      ""
    );
  }
  return (
    options.destinationNumber ||
    options.remoteCallerNumber ||
    options.callerNumber ||
    ""
  );
};

const getRtcControlId = (call) => {
  return (
    call?.telnyxIDs?.telnyxCallControlId ||
    call?.options?.telnyxCallControlId ||
    null
  );
};

const mapRtcState = (state) => {
  if (state === null || state === undefined) return null;
  const normalized = typeof state === "string" ? state.toLowerCase() : state;

  if (normalized === "ringing" || normalized === 4) return "ringing";
  if (normalized === "active" || normalized === 7) return "in-progress";
  if (normalized === "hangup" || normalized === 9 || normalized === "destroy" || normalized === 10)
    return "completed";
  if (normalized === "early" || normalized === 6 || normalized === "answering" || normalized === 5)
    return "ringing";
  if (normalized === "trying" || normalized === 2 || normalized === "requesting" || normalized === 1)
    return "dialing";
  return "dialing";
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export function CallProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [callState, setCallState] = useState({
    status: "idle",
    direction: null,
    phoneNumber: "",
    callId: null,
    callControlId: null,
    source: "call-control",
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
  const telnyxClientRef = useRef(null);
  const activeRtcCallRef = useRef(null);
  const lastSyncedStatusRef = useRef(null);
  const lastSyncedControlIdRef = useRef(null);
  const lookedUpCallIdRef = useRef(new Set());
  const pushInitRef = useRef(false);
  const [webrtcReady, setWebrtcReady] = useState(false);
  const [webrtcError, setWebrtcError] = useState("");
  const [fromNumber, setFromNumber] = useState("");

  const isActive = ACTIVE_STATUSES.has(callState.status);
  const isIncoming = callState.direction === "inbound" && callState.status === "ringing";

  const resetCallState = () => {
    setCallState({
      status: "idle",
      direction: null,
      phoneNumber: "",
      callId: null,
      callControlId: null,
      source: "call-control",
      startedAt: null,
      error: ""
    });
    setDuration(0);
    setMuted(false);
    setSpeakerOn(false);
    setOnHold(false);
    setShowDialpad(false);
    activeRtcCallRef.current = null;
    lastSyncedStatusRef.current = null;
    lastSyncedControlIdRef.current = null;
    lookedUpCallIdRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  };

  const setCallFromApi = (call) => {
    if (!call) {
      if (activeRtcCallRef.current) {
        return;
      }
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
        source: "call-control",
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

  const syncCallStatus = async (status, callControlId) => {
    if (!callState.callId || !status) return;
    const controlChanged =
      callControlId && lastSyncedControlIdRef.current !== callControlId;
    if (lastSyncedStatusRef.current === status && !controlChanged) return;
    lastSyncedStatusRef.current = status;
    if (callControlId) {
      lastSyncedControlIdRef.current = callControlId;
    }

    await API.patch(`/api/dialer/call/${callState.callId}/status`, {
      status,
      callControlId
    });
  };

  const updateCallFromRtc = (call) => {
    if (!call) return;

    const status = mapRtcState(call.state);
    const direction = String(call.direction || "").toLowerCase() === "inbound" ? "inbound" : "outbound";
    const displayNumber = getRtcDisplayNumber(call);
    const callControlId = getRtcControlId(call);

    if (!callState.callId && callControlId && !lookedUpCallIdRef.current.has(callControlId)) {
      lookedUpCallIdRef.current.add(callControlId);
      API.get(`/api/dialer/calls/${callControlId}`).then((response) => {
        if (response?.data?.call?._id) {
          setCallState((prev) => ({ ...prev, callId: response.data.call._id }));
        }
      });
    }

    setCallState((prev) => ({
      ...prev,
      status: status || prev.status,
      direction: direction || prev.direction,
      phoneNumber: displayNumber || prev.phoneNumber,
      callControlId: callControlId || prev.callControlId,
      source: "webrtc",
      startedAt:
        status === "in-progress"
          ? prev.startedAt || new Date()
          : prev.startedAt
    }));

    syncCallStatus(status, callControlId).catch(() => {});

    if (status === "completed" || status === "failed" || status === "missed") {
      setTimeout(() => resetCallState(), 800);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setWebrtcReady(false);
      setWebrtcError("");
      setFromNumber("");
      if (telnyxClientRef.current?.disconnect) {
        telnyxClientRef.current.disconnect();
      }
      telnyxClientRef.current = null;
      activeRtcCallRef.current = null;
      return;
    }

    let isMounted = true;
    const setupClient = async () => {
      const response = await API.get("/api/dialer/webrtc/token");
      if (!isMounted) return;

      if (response.error) {
        setWebrtcError(response.error);
        return;
      }

      const token = response.data?.token;
      const from = response.data?.fromNumber;
      setFromNumber(from || "");

      if (!token) {
        setWebrtcError("WebRTC token unavailable");
        return;
      }

      const client = new TelnyxRTC({ login_token: token });
      client.remoteElement = "telnyx-remote-audio";
      client.localElement = "telnyx-local-audio";
      telnyxClientRef.current = client;

      client.on(SwEvent.Ready, () => {
        if (isMounted) setWebrtcReady(true);
      });
      client.on(SwEvent.Error, (error) => {
        if (isMounted) setWebrtcError(error?.message || "WebRTC error");
      });
      client.on(SwEvent.Notification, (notification) => {
        if (!notification?.call) return;
        activeRtcCallRef.current = notification.call;
        updateCallFromRtc(notification.call);
      });

      client.connect();
    };

    setupClient();

    return () => {
      isMounted = false;
      if (telnyxClientRef.current?.off) {
        telnyxClientRef.current.off(SwEvent.Ready);
        telnyxClientRef.current.off(SwEvent.Error);
        telnyxClientRef.current.off(SwEvent.Notification);
      }
      if (telnyxClientRef.current?.disconnect) {
        telnyxClientRef.current.disconnect();
      }
      telnyxClientRef.current = null;
      activeRtcCallRef.current = null;
      setWebrtcReady(false);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || pushInitRef.current) return;
    pushInitRef.current = true;

    const setupPush = async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }

      const publicKeyResponse = await API.get("/api/notifications/public-key");
      if (publicKeyResponse.error || !publicKeyResponse.data?.publicKey) {
        return;
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();

      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKeyResponse.data.publicKey)
        }));

      await API.post("/api/notifications/subscribe", { subscription });
    };

    setupPush().catch((err) => {
      console.warn("Push setup failed:", err);
    });
  }, [isAuthenticated]);

  const startCall = async (destination) => {
    if (!destination) return { success: false, error: "Phone number required." };
    if (isPlacingCall) return { success: false, error: "Call already in progress." };

    setIsPlacingCall(true);
    setCallState((prev) => ({ ...prev, error: "" }));

    const hasWebrtc = Boolean(telnyxClientRef.current && webrtcReady && fromNumber);

    if (hasWebrtc) {
      let stream = null;
      try {
        stream = await requestMicrophone();
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

      const logResponse = await API.post("/api/dialer/call", {
        to: destination,
        useWebrtc: true
      });

      if (logResponse.error) {
        setCallState((prev) => ({ ...prev, error: logResponse.error }));
        setIsPlacingCall(false);
        return { success: false, error: logResponse.error };
      }

      try {
        const call = telnyxClientRef.current.newCall({
          destinationNumber: destination,
          callerNumber: fromNumber || undefined,
          localStream: stream || undefined,
          audio: true,
          video: false
        });
        activeRtcCallRef.current = call;

        const callControlId = getRtcControlId(call);
        const callId = logResponse.data?.callId || null;

        setCallState({
          status: "dialing",
          direction: "outbound",
          phoneNumber: destination,
          callId,
          callControlId: callControlId || logResponse.data?.callControlId || null,
          source: "webrtc",
          startedAt: null,
          error: ""
        });

        if (callId && callControlId) {
          API.post(`/api/dialer/call/${callId}/control`, { callControlId });
        }
      } catch (err) {
        setCallState((prev) => ({
          ...prev,
          error: "Failed to start WebRTC call."
        }));
        setIsPlacingCall(false);
        return { success: false, error: "Failed to start WebRTC call." };
      }

      setIsPlacingCall(false);
      return { success: true };
    }

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
      source: "call-control",
      startedAt: null,
      error: webrtcError || ""
    });

    setIsPlacingCall(false);
    return { success: true };
  };

  const answerCall = async () => {
    const rtcCall = activeRtcCallRef.current;
    if (!rtcCall && !callState.callControlId) {
      return { success: false, error: "No call to answer." };
    }

    try {
      await requestMicrophone();
    } catch (err) {
      setCallState((prev) => ({
        ...prev,
        error: "Microphone access is required to answer calls."
      }));
      return { success: false, error: "Microphone access is required to answer calls." };
    }

    if (rtcCall?.answer) {
      try {
        await rtcCall.answer({ video: false });
      } catch (err) {
        setCallState((prev) => ({ ...prev, error: "Failed to answer WebRTC call." }));
        return { success: false, error: "Failed to answer WebRTC call." };
      }
    }

    if (callState.callControlId && callState.source !== "webrtc") {
      const response = await API.post(`/api/dialer/call/${callState.callControlId}/answer`);
      if (response.error) {
        setCallState((prev) => ({ ...prev, error: response.error }));
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
          localStreamRef.current = null;
        }
        return { success: false, error: response.error };
      }
    }

    setCallState((prev) => ({
      ...prev,
      status: "in-progress",
      startedAt: prev.startedAt || new Date()
    }));
    return { success: true };
  };

  const endCall = async () => {
    const rtcCall = activeRtcCallRef.current;
    if (rtcCall?.hangup) {
      try {
        rtcCall.hangup();
      } catch (err) {
        console.warn("Failed to hang up WebRTC call:", err);
      }
    }

    if (callState.callControlId && callState.source !== "webrtc") {
      const response = await API.post(`/api/dialer/call/${callState.callControlId}/hangup`);
      if (response.error) {
        setCallState((prev) => ({ ...prev, error: response.error }));
        return { success: false, error: response.error };
      }
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
    const rtcCall = activeRtcCallRef.current;
    if (rtcCall?.toggleAudioMute) {
      rtcCall.toggleAudioMute();
    }

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

  const toggleHold = () => {
    const rtcCall = activeRtcCallRef.current;
    if (rtcCall?.toggleHold) {
      rtcCall.toggleHold();
    }
    setOnHold((prev) => !prev);
  };

  const toggleSpeaker = () => {
    const rtcCall = activeRtcCallRef.current;
    if (rtcCall?.setSpeakerPhone) {
      rtcCall.setSpeakerPhone(!speakerOn);
    }
    setSpeakerOn((prev) => !prev);
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
      toggleSpeaker,
      toggleHold,
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
      toggleMute,
      toggleHold,
      toggleSpeaker
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  return useContext(CallContext);
}
