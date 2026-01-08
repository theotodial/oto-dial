import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * PublicRoute Component
 * 
 * Prevents authenticated users from accessing login/signup pages
 * Redirects logged-in users to dashboard
 */
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to recents if already logged in
  if (isAuthenticated) {
    return <Navigate to="/recents" replace />;
  }

  // Render the public page (login/signup)
  return children;
}

export default PublicRoute;

