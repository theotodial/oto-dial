import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import API from "../api";
import { OTODIAL_SMS_OUTBOUND_EVENT } from "../constants/smsOutboundEvents";
import { clearCachedFetch, removeStorageKey } from "../utils/appCache";
import {
  BOOTSTRAP_REFRESH_EVENT,
  BOOTSTRAP_REFRESH_STORAGE_KEY,
  shouldRefreshSubscription,
} from "../utils/subscriptionSync";

const AppStateContext = createContext(null);

export function emptyUsageBootstrap() {
  return {
    smsUsed: 0,
    minutesUsed: 0,
    smsRemaining: 0,
    minutesRemaining: 0,
    smsLimit: 0,
    minutesLimit: 0,
    isSmsEnabled: false,
    isCallEnabled: false,
  };
}

/** Matches backend when no subscription row exists */
export function inactiveSubscriptionBootstrap() {
  return {
    id: null,
    status: "inactive",
    planName: null,
    limits: null,
    hasSubscription: false,
    isActive: false,
    isManuallyEnabled: false,
    showUsage: false,
    planType: null,
    displayUnlimited: false,
    isUnlimited: false,
    unlimitedMinutesDisplay: false,
    unlimitedSmsDisplay: false,
    voiceCallsEnabled: true,
    smsCampaignPlan: false,
  };
}

function normalizeClientFeatures(u) {
  const f = u?.features;
  return {
    voiceEnabled: f?.voiceEnabled !== false,
    campaignEnabled: Boolean(f?.campaignEnabled),
  };
}

function normalizeClientPreferences(u) {
  const p = u?.preferences;
  return {
    campaignMode: p?.campaignMode === "pro" ? "pro" : "lite",
  };
}

function normalizeUserFromLoginOrMe(u) {
  if (!u) return null;
  const id = u._id ?? u.id;
  if (!id) return null;
  return {
    _id: id,
    id: String(id),
    name: u.name || u.firstName || "",
    email: u.email,
    isEmailVerified: u.isEmailVerified !== false,
    features: normalizeClientFeatures(u),
    preferences: normalizeClientPreferences(u),
    mode: u.mode === "campaign" ? "campaign" : "voice",
  };
}

/** When /api/app/bootstrap fails, keep the session using data from POST /api/auth/login|register. */
export function buildLoginFallbackPayload(loginUser) {
  const user = normalizeUserFromLoginOrMe(loginUser);
  if (!user) return null;
  return {
    success: true,
    user,
    subscription: inactiveSubscriptionBootstrap(),
    usage: emptyUsageBootstrap(),
  };
}

export function AppStateProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [isReady, setIsReady] = useState(() => !localStorage.getItem("token"));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasFetchedRef = useRef(false);
  /** After first successful bootstrap with a token, background refetches must NOT flip isReady (avoids unmounting the whole app). */
  const sessionEstablishedRef = useRef(false);
  const lastBootstrapRefreshRef = useRef(0);

  const clearAppState = useCallback(() => {
    clearCachedFetch("auth:/api/app/bootstrap");
    clearCachedFetch("auth:/api/users/me");
    clearCachedFetch("auth:/api/subscription");
    removeStorageKey("otodial_app_bootstrap_v2");
    setUser(null);
    setSubscription(null);
    setUsage(null);
    setIsReady(!localStorage.getItem("token"));
    hasFetchedRef.current = false;
    sessionEstablishedRef.current = false;
  }, []);

  const applyBootstrapData = useCallback((data, activeToken) => {
    const rawUser = data?.user || null;
    const nextUser = rawUser
      ? {
          ...rawUser,
          features: normalizeClientFeatures(rawUser),
          preferences: normalizeClientPreferences(rawUser),
          mode: rawUser.mode === "campaign" ? "campaign" : "voice",
        }
      : null;
    const nextSubscription = data?.subscription || null;
    const nextUsage = data?.usage ?? emptyUsageBootstrap();
    setUser(nextUser);
    setSubscription(nextSubscription);
    setUsage(nextUsage);
    setIsReady(true);
    if (activeToken && nextUser) {
      sessionEstablishedRef.current = true;
    }
    return data;
  }, []);

  const fetchBootstrap = useCallback(async ({ force = false } = {}) => {
    const activeToken = localStorage.getItem("token");
    setToken(activeToken);

    if (!activeToken) {
      clearAppState();
      setIsReady(true);
      return null;
    }

    if (force) {
      clearCachedFetch("auth:/api/app/bootstrap");
    }

    setIsRefreshing(true);
    if (!sessionEstablishedRef.current) {
      setIsReady(false);
    }
    try {
      const res = await API.get("/api/app/bootstrap");
      if (res.error || !res.data?.success) {
        const status = Number(res.status || 0);
        const msg = res.error || res.data?.error || "Failed to load app state";
        const err = new Error(msg);
        err.status = status;
        throw err;
      }
      return applyBootstrapData(res.data, activeToken);
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status === 401 || status === 403) {
        clearAppState();
        localStorage.removeItem("token");
        setToken(null);
      }
      setIsReady(true);
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }, [applyBootstrapData, clearAppState]);

  useEffect(() => {
    const activeToken = localStorage.getItem("token");
    setToken(activeToken);

    if (!activeToken) {
      clearAppState();
      setIsReady(true);
      return;
    }

    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    fetchBootstrap().catch(() => {
      /* handled in fetchBootstrap */
    });
  }, [applyBootstrapData, clearAppState, fetchBootstrap]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const requestBootstrapRefresh = (detail = {}) => {
      const now = Date.now();
      if (now - lastBootstrapRefreshRef.current < 1500) {
        return;
      }

      const currentUserId = user?._id ?? user?.id ?? null;
      if (!shouldRefreshSubscription(detail, currentUserId)) {
        return;
      }

      lastBootstrapRefreshRef.current = now;
      fetchBootstrap({ force: true }).catch(() => {
        /* handled in fetchBootstrap */
      });
    };

    const handleBootstrapRefresh = (event) => {
      requestBootstrapRefresh(event?.detail || {});
    };

    const handleStorageRefresh = (event) => {
      if (event.key !== BOOTSTRAP_REFRESH_STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        requestBootstrapRefresh(JSON.parse(event.newValue));
      } catch (_) {
        requestBootstrapRefresh({});
      }
    };

    window.addEventListener(BOOTSTRAP_REFRESH_EVENT, handleBootstrapRefresh);
    window.addEventListener("storage", handleStorageRefresh);

    return () => {
      window.removeEventListener(BOOTSTRAP_REFRESH_EVENT, handleBootstrapRefresh);
      window.removeEventListener("storage", handleStorageRefresh);
    };
  }, [fetchBootstrap, token, user]);

  useEffect(() => {
    const activeToken = localStorage.getItem("token");
    const uid = user?._id ?? user?.id;
    if (!activeToken || !uid) {
      return undefined;
    }

    const base = (import.meta.env.VITE_API_URL || window.location.origin || "").replace(/\/$/, "");
    const socket = io(`${base}/user`, {
      path: "/socket.io",
      auth: { token: activeToken },
      transports: ["websocket", "polling"],
    });

    const onUsage = (payload) => {
      if (!payload?.userId) return;
      if (String(payload.userId) !== String(uid)) return;
      setUsage((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (payload.newSmsUsed != null) next.smsUsed = Number(payload.newSmsUsed);
        if (payload.newRemainingSms != null) next.smsRemaining = Number(payload.newRemainingSms);
        return next;
      });
    };

    socket.on("sms:usage-updated", onUsage);

    const dispatchOutboundLifecycle = (phase, payload) => {
      window.dispatchEvent(
        new CustomEvent(OTODIAL_SMS_OUTBOUND_EVENT, {
          detail: { phase, ...(payload && typeof payload === "object" ? payload : {}) },
        })
      );
    };

    const onQueued = (p) => dispatchOutboundLifecycle("queued", p);
    const onSent = (p) => dispatchOutboundLifecycle("sent", p);
    const onFailed = (p) => dispatchOutboundLifecycle("failed", p);

    socket.on("sms:queued", onQueued);
    socket.on("sms:sent", onSent);
    socket.on("sms:failed", onFailed);

    return () => {
      socket.off("sms:usage-updated", onUsage);
      socket.off("sms:queued", onQueued);
      socket.off("sms:sent", onSent);
      socket.off("sms:failed", onFailed);
      socket.disconnect();
    };
  }, [user?._id, user?.id]);

  const mergeUser = useCallback((partial) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      if (partial?.preferences) {
        next.preferences = {
          ...normalizeClientPreferences(prev),
          ...normalizeClientPreferences({ preferences: partial.preferences }),
        };
      } else {
        next.preferences = normalizeClientPreferences(prev);
      }
      if (partial?.features) {
        next.features = normalizeClientFeatures({ features: partial.features });
      }
      return next;
    });
  }, []);

  const setAuthToken = useCallback((newToken, bootstrapData = null) => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminProfile");

    if (!newToken) {
      localStorage.removeItem("token");
      setToken(null);
      clearAppState();
      setIsReady(true);
      return;
    }

    localStorage.setItem("token", newToken);
    setToken(newToken);

    if (bootstrapData?.user || bootstrapData?.subscription) {
      hasFetchedRef.current = true;
      applyBootstrapData(bootstrapData, newToken);
      return;
    }

    hasFetchedRef.current = false;
    sessionEstablishedRef.current = false;
    setIsReady(false);
    fetchBootstrap().catch(() => {
      /* handled in fetchBootstrap */
    });
  }, [applyBootstrapData, clearAppState, fetchBootstrap]);

  const value = useMemo(() => ({
    token,
    user,
    subscription,
    usage,
    isReady,
    isRefreshing,
    setAuthToken,
    mergeUser,
    clearAppState,
    refetchBootstrap: () => fetchBootstrap({ force: true }),
  }), [token, user, subscription, usage, isReady, isRefreshing, setAuthToken, mergeUser, clearAppState, fetchBootstrap]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}
