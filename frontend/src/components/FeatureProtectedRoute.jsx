import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SkeletonApp from './SkeletonApp';

function pickFallbackPath(features) {
  const voice = features?.voiceEnabled !== false;
  const camp = Boolean(features?.campaignEnabled);
  if (voice) return '/recents';
  if (camp) return '/campaign';
  return '/dashboard';
}

/**
 * @param {{ feature: 'voice' | 'campaign', children: import('react').ReactNode }} props
 */
export default function FeatureProtectedRoute({ feature, children }) {
  const { user, isAuthenticated, hydrated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const qs = location.search || '';
    return <Navigate to={`/login${qs}`} state={{ from: location }} replace />;
  }

  if (!hydrated) {
    return <SkeletonApp />;
  }

  const f = user?.features || { voiceEnabled: true, campaignEnabled: false };
  const allowed =
    feature === 'voice' ? f.voiceEnabled !== false : Boolean(f.campaignEnabled);

  if (!allowed) {
    const to = pickFallbackPath(f);
    if (to === location.pathname) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to={to} replace />;
  }

  return children;
}
