import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Auth gate: redirect if no token only. Never blocks first paint with a full-app skeleton.
 */
function ProtectedRoute({ children }) {
  const auth = useAuth();
  const isAuthenticated = auth?.isAuthenticated ?? false;
  const location = useLocation();

  if (!isAuthenticated) {
    const qs = location.search || '';
    return <Navigate to={`/login${qs}`} state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
