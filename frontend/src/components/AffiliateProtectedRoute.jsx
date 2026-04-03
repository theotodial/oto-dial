import { Navigate, useLocation } from 'react-router-dom';
import { getAffiliateToken } from '../utils/affiliateAuth';

function AffiliateProtectedRoute({ children }) {
  const location = useLocation();
  const token = getAffiliateToken();

  if (!token) {
    return <Navigate to="/affiliate/login" state={{ from: location }} replace />;
  }

  return children;
}

export default AffiliateProtectedRoute;
