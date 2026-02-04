import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function OAuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      try {
        // Store token so AuthContext picks it up
        localStorage.removeItem('adminToken');
        localStorage.setItem('token', token);
        
        // Redirect to voice app (Recents) after short delay
        navigate('/recents', { replace: true });
      } catch (e) {
        console.error('Failed to store OAuth token', e);
        navigate('/login', { replace: true });
      }
    } else {
      navigate('/login', { replace: true });
    }
  }, [searchParams, navigate]);

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
