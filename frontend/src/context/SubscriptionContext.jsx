import { createContext, useContext, useCallback, useMemo } from "react";
import { useAppState, BOOTSTRAP_PENDING_USER_ID } from "./AppStateContext";

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { subscription, usage, isReady, isRefreshing, refetchBootstrap, user } = useAppState();

  const refreshSubscription = useCallback(async () => {
    const data = await refetchBootstrap();
    return data?.subscription || null;
  }, [refetchBootstrap]);

  const value = useMemo(
    () => ({
      subscription,
      usage,
      loading: Boolean(
        isRefreshing &&
          user &&
          user._id !== BOOTSTRAP_PENDING_USER_ID
      ),
      hydrated: isReady,
      refreshSubscription,
    }),
    [subscription, usage, isRefreshing, isReady, user, refreshSubscription]
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
