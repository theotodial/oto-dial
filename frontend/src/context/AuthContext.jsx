import { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setToken(storedToken);
      setUser({}); // minimal placeholder user
    }
    setLoading(false);
  }, []);

  // Allow setting auth state directly from an existing token (e.g., OAuth)
  const setAuthFromToken = (newToken, userData = {}) => {
    if (!newToken) return;
    // Clear admin token when user logs in to prevent conflicts
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminProfile");
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(userData);
  };

  // ✅ LOGIN - uses API wrapper, checks for token
  const login = async (email, password) => {
    const response = await API.post("/api/auth/login", { email, password });
    
    if (response.error) {
      return { success: false, error: response.error };
    }

    if (response.data?.token) {
      // Clear admin token when user logs in to prevent conflicts
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminProfile");
      localStorage.setItem("token", response.data.token);
      setToken(response.data.token);
      const userData = response.data?.user || { email };
      setUser(userData);
      return { 
        success: true,
        user: userData,
        sessionInfo: response.data?.sessionInfo || null
      };
    }

    return { success: false, error: "No token received" };
  };

  // ✅ SIGNUP - uses API wrapper, checks for token
  const signup = async (email, password, additionalData = {}) => {
    const payload = { 
      email, 
      password,
      ...additionalData // firstName, lastName, phone, countryCode
    };
    
    const response = await API.post("/api/auth/register", payload);
    
    if (response.error) {
      return { success: false, error: response.error };
    }

    if (response.data?.token) {
      // Clear admin token when user signs up to prevent conflicts
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminProfile");
      localStorage.setItem("token", response.data.token);
      setToken(response.data.token);
      const userData = response.data?.user || { email, ...additionalData };
      setUser(userData);
      return { success: true, user: userData };
    }

    return { success: false, error: "No token received" };
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    window.location.href = "/login";
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
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
