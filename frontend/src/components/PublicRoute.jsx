import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * PublicRoute Component
 * 
 * Prevents authenticated users from accessing login/signup pages
 * Redirects logged-in users to dashboard
 */
function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/recents" replace />;
  }

  return children;
}

export default PublicRoute;

