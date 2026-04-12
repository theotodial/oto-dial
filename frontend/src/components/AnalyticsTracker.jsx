import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { trackPageView, startTimeTracking, stopTimeTracking } from '../utils/analytics';

function AnalyticsTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id || user?._id || null;

  useEffect(() => {
    // Track page view on route change
    const page = `${location.pathname}${location.search || ''}`;
    const pageTitle = document.title || page;

    trackPageView(page, pageTitle, userId);
    startTimeTracking();

    // Cleanup on unmount
    return () => {
      stopTimeTracking();
    };
  }, [location.pathname, location.search, userId]);

  return null; // This component doesn't render anything
}

export default AnalyticsTracker;
