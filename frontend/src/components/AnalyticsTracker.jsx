import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { initAnalytics, identify, trackPageView, track } from '../utils/analyticsClient';
import { ANALYTICS_EVENTS } from '../constants/analyticsEvents';

function AnalyticsTracker() {
  const location = useLocation();
  const { user } = useAuth();
  const userId = user?.id || user?._id || null;

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    identify(userId, {
      plan: user?.subscription?.planName || user?.planName,
      subscriptionPlan: user?.subscription?.planKey,
      country: user?.country,
      language: typeof navigator !== 'undefined' ? navigator.language : null
    });
  }, [userId, user?.subscription?.planName, user?.planName, user?.country]);

  useEffect(() => {
    const page = `${location.pathname}${location.search || ''}`;
    const pageTitle = document.title || page;
    trackPageView(page, pageTitle, userId);

    if (page.startsWith('/dashboard')) {
      track(ANALYTICS_EVENTS.DASHBOARD_OPENED, { page }, { category: 'navigation', ga: true });
    }
    if (page.includes('/adminbobby/analytics')) {
      track(ANALYTICS_EVENTS.ANALYTICS_OPENED, { page }, { category: 'admin', ga: true });
    }
  }, [location.pathname, location.search, userId]);

  return null;
}

export default AnalyticsTracker;
