import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function OAuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthFromToken, refreshUser } = useAuth();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const token = searchParams.get('token');

      if (!token) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        setAuthFromToken(token);
        await refreshUser();
        if (!cancelled) {
          navigate('/recents', { replace: true });
        }
      } catch (e) {
        console.error('Failed to complete OAuth sign-in', e);
        if (!cancelled) {
          navigate('/login', { replace: true });
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, setAuthFromToken, refreshUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-700 dark:text-gray-300 font-medium">
          Signing you in with Google...
        </p>
      </div>
    </div>
  );
}

export default OAuthSuccess;
