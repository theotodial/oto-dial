import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import API from "../api";
import { cachedFetch, clearCachedFetch, readJsonStorage, removeStorageKey, writeJsonStorage } from "../utils/appCache";

const AppStateContext = createContext(null);

const APP_BOOTSTRAP_CACHE_KEY = "otodial_app_bootstrap_v1";

/** Matches backend buildPublicSubscriptionState(null) — used when bootstrap fails but session is valid */
export function inactiveSubscriptionBootstrap() {
  return {
    active: false,
    status: "inactive",
    plan: "No Plan",
    planName: "No Plan",
    minutesRemaining: 0,
    smsRemaining: 0,
    isUnlimited: false,
    displayUnlimited: false,
    periodStart: null,
    periodEnd: null,
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
  };
}

function readBootstrapCache(token) {
  if (!token) return null;
  const parsed = readJsonStorage(APP_BOOTSTRAP_CACHE_KEY);
  const tail = String(token).slice(-16);
  if (parsed?.tokenTail !== tail || !parsed?.data) {
    return null;
  }
  return parsed.data;
}

function writeBootstrapCache(token, data) {
  if (!token || !data) return;
  writeJsonStorage(APP_BOOTSTRAP_CACHE_KEY, {
    tokenTail: String(token).slice(-16),
    data
  });
}

export function AppStateProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [isReady, setIsReady] = useState(() => !localStorage.getItem("token"));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasFetchedRef = useRef(false);

  const clearAppState = useCallback(() => {
    clearCachedFetch("auth:/api/app/bootstrap");
    clearCachedFetch("auth:/api/users/me");
    clearCachedFetch("auth:/api/subscription");
    removeStorageKey(APP_BOOTSTRAP_CACHE_KEY);
    setUser(null);
    setSubscription(null);
    setIsReady(!localStorage.getItem("token"));
    hasFetchedRef.current = false;
  }, []);

  const applyBootstrapData = useCallback((data, activeToken) => {
    const nextUser = data?.user || null;
    const nextSubscription = data?.subscription || null;
    setUser(nextUser);
    setSubscription(nextSubscription);
    setIsReady(true);
    if (activeToken && data) {
      writeBootstrapCache(activeToken, data);
    }
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
      const res = await cachedFetch("auth:/api/app/bootstrap", () => API.get("/api/app/bootstrap"));
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

    const cached = readBootstrapCache(activeToken);
    if (cached) {
      applyBootstrapData(cached, activeToken);
    }

    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    fetchBootstrap().catch(() => {
      /* handled in fetchBootstrap */
    });
  }, [applyBootstrapData, clearAppState, fetchBootstrap]);

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
    hasFetchedRef.current = true;

    if (bootstrapData?.user || bootstrapData?.subscription) {
      applyBootstrapData(bootstrapData, newToken);
      return;
    }

    const cached = readBootstrapCache(newToken);
    if (cached) {
      applyBootstrapData(cached, newToken);
    } else {
      setIsReady(false);
    }
  }, [applyBootstrapData, clearAppState]);

  const value = useMemo(() => ({
    token,
    user,
    subscription,
    isReady,
    isRefreshing,
    setAuthToken,
    clearAppState,
    refetchBootstrap: () => fetchBootstrap({ force: true }),
  }), [token, user, subscription, isReady, isRefreshing, setAuthToken, clearAppState, fetchBootstrap]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return ctx;
}
