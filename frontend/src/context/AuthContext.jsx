import { createContext, useContext, useCallback } from "react";
import API from "../api";
import {
  buildLoginFallbackPayload,
  emptyUsageBootstrap,
  inactiveSubscriptionBootstrap,
  useAppState,
} from "./AppStateContext";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const {
    token,
    user,
    isReady,
    isRefreshing,
    setAuthToken,
    clearAppState,
    refetchBootstrap,
  } = useAppState();

  const login = async (email, password) => {
    const response = await API.post("/api/auth/login", { email, password });

    if (response.error) {
      return { success: false, error: response.error };
    }

    if (response.data?.token) {
      const newToken = response.data.token;
      const rawUser = response.data?.user || { email };
      setAuthToken(newToken);
      try {
        await refetchBootstrap();
      } catch (err) {
        console.warn(
          "[auth] Bootstrap failed after login; keeping session from login response:",
          err?.message || err
        );
        let fallback = buildLoginFallbackPayload(rawUser);
        if (!fallback) {
          const me = await API.get("/api/users/me");
          if (!me.error && me.data?.user) {
            fallback = buildLoginFallbackPayload(me.data.user);
          }
        }
        if (fallback) {
          setAuthToken(newToken, fallback);
        } else {
          setAuthToken(newToken, {
            success: true,
            user: {
              _id: "pending",
              id: "pending",
              name: "",
              email: typeof rawUser?.email === "string" ? rawUser.email : "",
              isEmailVerified: true,
            },
            subscription: inactiveSubscriptionBootstrap(),
            usage: emptyUsageBootstrap(),
          });
        }
      }
      return {
        success: true,
        user: response.data?.user || { email },
        sessionInfo: response.data?.sessionInfo || null,
      };
    }

    return { success: false, error: "No token received" };
  };

  const signup = async (email, password, additionalData = {}) => {
    const payload = {
      email,
      password,
      ...additionalData,
    };

    const response = await API.post("/api/auth/register", payload);

    if (response.error) {
      return { success: false, error: response.error };
    }

    if (response.data?.token) {
      const newToken = response.data.token;
      const rawUser = response.data?.user || { email, ...additionalData };
      setAuthToken(newToken);
      try {
        await refetchBootstrap();
      } catch (err) {
        console.warn(
          "[auth] Bootstrap failed after signup; keeping session from signup response:",
          err?.message || err
        );
        let fallback = buildLoginFallbackPayload(rawUser);
        if (!fallback) {
          const me = await API.get("/api/users/me");
          if (!me.error && me.data?.user) {
            fallback = buildLoginFallbackPayload(me.data.user);
          }
        }
        if (fallback) {
          setAuthToken(newToken, fallback);
        } else {
          setAuthToken(newToken, {
            success: true,
            user: {
              _id: "pending",
              id: "pending",
              name: "",
              email: typeof rawUser?.email === "string" ? rawUser.email : "",
              isEmailVerified: true,
            },
            subscription: inactiveSubscriptionBootstrap(),
            usage: emptyUsageBootstrap(),
          });
        }
      }
      return {
        success: true,
        user: response.data?.user || { email, ...additionalData },
        requiresEmailVerification: Boolean(response.data?.requiresEmailVerification),
        verificationEmailSent: response.data?.verificationEmailSent,
        message: response.data?.message,
      };
    }

    return { success: false, error: "No token received" };
  };

  const logout = useCallback(() => {
    setAuthToken(null);
    clearAppState();
  }, [clearAppState, setAuthToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading: isRefreshing && !isReady,
        hydrated: Boolean(isReady && user),
        isAuthenticated: !!token,
        login,
        signup,
        logout,
        setAuthFromToken: setAuthToken,
        refreshUser: async () => {
          const data = await refetchBootstrap();
          return data?.user || null;
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
