import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import API from "../api";
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
  }, []);

  const applyBootstrapData = useCallback((data, activeToken) => {
    const nextUser = data?.user || null;
    const nextSubscription = data?.subscription || null;
    const nextUsage = data?.usage ?? emptyUsageBootstrap();
    setUser(nextUser);
    setSubscription(nextSubscription);
    setUsage(nextUsage);
    setIsReady(true);
    console.log("BOOTSTRAP DATA", data);
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
    setIsReady(false);
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
    clearAppState,
    refetchBootstrap: () => fetchBootstrap({ force: true }),
  }), [token, user, subscription, usage, isReady, isRefreshing, setAuthToken, clearAppState, fetchBootstrap]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}
