import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import API from '../api';
import {
  canAccessAdminPath,
  clearStoredAdminProfile,
  getFirstAccessibleAdminPath
} from '../utils/adminAccess';

function AdminProtectedRoute({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      setLoading(true);
      setAuthorized(false);
      const token = localStorage.getItem('adminToken');
      
      if (!token) {
        clearStoredAdminProfile();
        setLoading(false);
        navigate('/adminbobby');
        return;
      }

      try {
        const response = await API.get('/api/admin/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.error || !response.data?.success) {
          clearStoredAdminProfile();
          localStorage.removeItem('adminToken');
          navigate('/adminbobby');
          return;
        }

        const adminProfile = response.data.user || {};
        localStorage.setItem('adminProfile', JSON.stringify(adminProfile));

        if (!canAccessAdminPath(location.pathname, adminProfile)) {
          const fallbackPath = getFirstAccessibleAdminPath(adminProfile);
          if (fallbackPath && fallbackPath !== location.pathname) {
            navigate(fallbackPath, { replace: true });
            return;
          }
          setAccessError('Your account does not have access to this admin section.');
          setAuthorized(false);
          return;
        }

        if (response.data?.success) {
          setAccessError('');
          setAuthorized(true);
        }
      } catch (err) {
        clearStoredAdminProfile();
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{accessError}</p>
          <button
            onClick={() => navigate('/adminbobby')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return authorized ? children : null;
}

export default AdminProtectedRoute;
