import { createContext, useContext, useState, useEffect } from 'react';
import { login as loginService } from '../services/authService';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [jwt, setJwt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load JWT from localStorage on mount
    const storedJwt = localStorage.getItem('jwt');
    if (storedJwt) {
      setJwt(storedJwt);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const result = await loginService({ email, password });
      
      // Assuming the API returns a JWT token
      // Adjust based on your actual API response structure
      const token = result.token || result.jwt || result.data?.token;
      
      if (token) {
        localStorage.setItem('jwt', token);
        setJwt(token);
        return { success: true };
      } else {
        // If no token in response, store a placeholder or use email as identifier
        // This depends on your backend implementation
        localStorage.setItem('jwt', 'authenticated');
        localStorage.setItem('userEmail', email);
        setJwt('authenticated');
        return { success: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = () => {
    localStorage.removeItem('jwt');
    localStorage.removeItem('userEmail');
    setJwt(null);
  };

  const value = {
    jwt,
    login,
    logout,
    isAuthenticated: !!jwt,
    loading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

