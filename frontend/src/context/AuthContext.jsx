import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper function to determine authentication provider
  const getProvider = (user) => {
    if (!user) return 'email';
    
    // Check identities array first (most reliable for OAuth)
    if (user.identities && user.identities.length > 0) {
      const identityProvider = user.identities[0]?.provider;
      if (identityProvider === 'google') {
        return 'google';
      }
    }
    
    // Check app_metadata as fallback
    if (user.app_metadata?.provider === 'google') {
      return 'google';
    }
    
    // Default to email
    return 'email';
  };

  // Helper function to ensure user and wallet exist (idempotent)
  const ensureUserAndWallet = async (user) => {
    if (!user) return;
    
    try {
      const provider = getProvider(user);
      
      // Ensure user exists in public.users
      const { error: userError } = await supabase.rpc('ensure_user_exists', {
        p_user_id: user.id,
        p_email: user.email || '',
        p_provider: provider
      });
      
      if (userError) {
        // Silently fail - user might already exist or RLS might block
        // This is idempotent, so it's safe to ignore errors
      }
      
      // Ensure wallet exists
      const { error: walletError } = await supabase.rpc('ensure_wallet_exists', {
        p_user_id: user.id
      });
      
      if (walletError) {
        // Silently fail - wallet might already exist or RLS might block
        // This is idempotent, so it's safe to ignore errors
      }
    } catch (error) {
      // Silently fail - functions are idempotent, safe to ignore
    }
  };

  useEffect(() => {
    let mounted = true;

    // Get initial session (handles page refresh and OAuth callbacks)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      // Store user_id for backward compatibility (works for both email and OAuth users)
      if (session?.user) {
        localStorage.setItem('user_id', session.user.id);
        // Ensure user and wallet exist in database (idempotent) - NON-BLOCKING
        // Don't await - let it run in background, auth state should not depend on DB
        ensureUserAndWallet(session.user).catch(() => {
          // Silently fail - this is idempotent and shouldn't block auth
        });
      }
      
      // ✅ CRITICAL: Always exit loading state IMMEDIATELY after setting session
      // Do NOT wait for ensureUserAndWallet - auth state is independent of DB state
      setLoading(false);
    }).catch((error) => {
      // If getSession fails, still exit loading state
      if (mounted) {
        setSession(null);
        setUser(null);
        setLoading(false);
      }
    });

    // Listen for auth changes (handles OAuth callbacks, login, logout, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      // Store user_id for backward compatibility (works for both email and OAuth users)
      if (session?.user) {
        localStorage.setItem('user_id', session.user.id);
        // Ensure user and wallet exist in database (idempotent) - NON-BLOCKING
        // Don't await - let it run in background, auth state should not depend on DB
        ensureUserAndWallet(session.user).catch(() => {
          // Silently fail - this is idempotent and shouldn't block auth
        });
      } else {
        // Clear user_id on logout
        localStorage.removeItem('user_id');
      }
      
      // ✅ CRITICAL: Always exit loading state IMMEDIATELY after setting session
      // Do NOT wait for ensureUserAndWallet - auth state is independent of DB state
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      setSession(data.session);
      setUser(data.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const signup = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        // Logout error - session cleared anyway
      }

      setSession(null);
      setUser(null);
      
      // Clean up any old localStorage items
      localStorage.removeItem('jwt');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('user_id');
    } catch (error) {
      // Logout error - session cleared anyway
      setSession(null);
      setUser(null);
    }
  };

  const value = {
    session,
    user,
    login,
    signup,
    logout,
    isAuthenticated: !!session,
    loading,
    // Backward compatibility
    jwt: session?.access_token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

