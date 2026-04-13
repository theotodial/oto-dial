import { createContext, useContext, useCallback, useMemo } from "react";
import { useAppState } from "./AppStateContext";

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { subscription, usage, isReady, isRefreshing, refetchBootstrap } = useAppState();

  const refreshSubscription = useCallback(async () => {
    const data = await refetchBootstrap();
    return data?.subscription || null;
  }, [refetchBootstrap]);

  const value = useMemo(
    () => ({
      subscription,
      usage,
      loading: isRefreshing && !isReady,
      hydrated: isReady,
      refreshSubscription,
    }),
    [subscription, usage, isRefreshing, isReady, refreshSubscription]
  );

  return (
    <SubscriptionContext.Provider value={value}>
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
