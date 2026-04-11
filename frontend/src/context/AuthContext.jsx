import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";

const AuthContext = createContext(null);

const USER_CACHE_KEY = "otodial_user_cache_v1";

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const persistUserCache = useCallback((t, u) => {
    const id = u?.id || u?._id;
    if (!t || !id) return;
    try {
      localStorage.setItem(
        USER_CACHE_KEY,
        JSON.stringify({
          tokenTail: String(t).slice(-16),
          user: { ...u, id: String(id) }
        })
      );
    } catch {
      /* ignore */
    }
  }, []);

  const fetchUserFromApi = useCallback(async () => {
    const t = localStorage.getItem("token");
    if (!t) return null;
    const res = await API.get("/api/users/me");
    if (res.error || !res.data?.user) return null;
    const u = res.data.user;
    persistUserCache(t, u);
    return u;
  }, [persistUserCache]);

  const refreshUser = useCallback(async () => {
    const u = await fetchUserFromApi();
    if (u) setUser((prev) => ({ ...prev, ...u }));
  }, [fetchUserFromApi]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        setToken(storedToken);
        try {
          const raw = localStorage.getItem(USER_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            const tail = String(storedToken).slice(-16);
            if (parsed?.tokenTail === tail && parsed?.user) {
              setUser(parsed.user);
            }
          }
        } catch {
          /* ignore */
        }
        const u = await fetchUserFromApi();
        if (!cancelled) {
          setUser(u || {});
          if (!u) {
            try {
              localStorage.removeItem(USER_CACHE_KEY);
            } catch {
              /* ignore */
            }
          }
        }
      } else if (!cancelled) {
        setUser(null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchUserFromApi]);

  const setAuthFromToken = (newToken, userData = {}) => {
    if (!newToken) return;
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminProfile");
    localStorage.setItem("token", newToken);
    setToken(newToken);
    const id = userData.id || userData._id;
    const merged = {
      ...userData,
      ...(id ? { id: String(id) } : {}),
      isEmailVerified:
        userData.isEmailVerified !== undefined
          ? userData.isEmailVerified
          : true,
    };
    setUser(merged);
    persistUserCache(newToken, merged);
  };

  const login = async (email, password) => {
    const response = await API.post("/api/auth/login", { email, password });

    if (response.error) {
      return { success: false, error: response.error };
    }

    if (response.data?.token) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminProfile");
      localStorage.setItem("token", response.data.token);
      setToken(response.data.token);
      const userData = response.data?.user || { email };
      setUser(userData);
      persistUserCache(response.data.token, userData);
      return {
        success: true,
        user: userData,
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
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminProfile");
      localStorage.setItem("token", response.data.token);
      setToken(response.data.token);
      const userData = response.data?.user || { email, ...additionalData };
      setUser(userData);
      persistUserCache(response.data.token, userData);
      return {
        success: true,
        user: userData,
        requiresEmailVerification: Boolean(response.data?.requiresEmailVerification),
        verificationEmailSent: response.data?.verificationEmailSent,
        message: response.data?.message,
      };
    }

    return { success: false, error: "No token received" };
  };

  const logout = () => {
    localStorage.removeItem("token");
    try {
      localStorage.removeItem(USER_CACHE_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    navigate("/login", { replace: true });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!token,
        login,
        signup,
        logout,
        setAuthFromToken,
        refreshUser,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
