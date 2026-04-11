import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import API from "../api";
import { useAuth } from "./AuthContext";

const SubscriptionContext = createContext(null);

const CACHE_KEY = "otodial_subscription_cache_v1";

function readCache(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (String(parsed.userId) !== String(userId)) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeCache(userId, data) {
  if (!userId || !data) return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ userId: String(userId), data })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function SubscriptionProvider({ children }) {
  const { token, user, loading: authLoading } = useAuth();
  const userId = user?.id || user?._id;
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshSubscription = useCallback(async () => {
    if (!token) {
      setSubscription(null);
      return null;
    }
    setLoading(true);
    try {
      const res = await API.get("/api/subscription");
      if (!res.error && res.data) {
        setSubscription(res.data);
        writeCache(userId, res.data);
        return res.data;
      }
    } finally {
      setLoading(false);
    }
    return null;
  }, [token, userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setSubscription(null);
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        /* ignore */
      }
      return;
    }

    if (userId) {
      const cached = readCache(userId);
      if (cached) setSubscription(cached);
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await API.get("/api/subscription");
      if (cancelled) return;
      if (!res.error && res.data) {
        setSubscription(res.data);
        writeCache(userId, res.data);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, token, userId]);

  return (
    <SubscriptionContext.Provider
      value={{ subscription, loading, refreshSubscription }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return ctx;
}
