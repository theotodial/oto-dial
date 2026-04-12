import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SkeletonApp from './SkeletonApp';

/**
 * ProtectedRoute Component
 * 
 * Protects authenticated pages from unauthenticated access
 * Redirects to login with return URL if not authenticated
 */
function ProtectedRoute({ children }) {
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const hydrated = auth?.hydrated ?? false;
  const location = useLocation();

  if (!isAuthenticated) {
    const qs = location.search || "";
    return <Navigate to={`/login${qs}`} state={{ from: location }} replace />;
  }

  if (!hydrated) {
    return <SkeletonApp />;
  }

  return children;
}

export default ProtectedRoute;

