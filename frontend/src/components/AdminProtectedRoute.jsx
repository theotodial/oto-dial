import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';

function AdminProtectedRoute({ children }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('adminToken');
      
      if (!token) {
        navigate('/adminbobby');
        return;
      }

      try {
        const response = await API.get('/api/admin/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data?.success) {
          setAuthorized(true);
        } else {
          localStorage.removeItem('adminToken');
          navigate('/adminbobby');
        }
      } catch (err) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [navigate]);

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

  return authorized ? children : null;
}

export default AdminProtectedRoute;
