import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { trackPageView, startTimeTracking, stopTimeTracking } from '../utils/analytics';

function AnalyticsTracker() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Track page view on route change
    const page = location.pathname;
    const pageTitle = document.title || page;

    // Get user ID from user object or decode from token
    let userId = null;
    if (user?.id) {
      userId = user.id;
    } else if (user?._id) {
      userId = user._id;
    }

    trackPageView(page, pageTitle, userId);
    startTimeTracking();

    // Cleanup on unmount
    return () => {
      stopTimeTracking();
    };
  }, [location.pathname, user]);

  return null; // This component doesn't render anything
}

export default AnalyticsTracker;
