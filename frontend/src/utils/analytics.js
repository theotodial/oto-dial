// Analytics tracking utility
import API from '../api';

// Generate or get session ID
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

// Get Google Analytics client ID
const getGAClientId = async () => {
  if (typeof window !== 'undefined' && window.gtag) {
    try {
      return new Promise((resolve) => {
        window.gtag('get', 'G-X3WN8RYCQ5', 'client_id', (clientId) => {
          resolve(clientId || null);
        });
        // Timeout after 1 second
        setTimeout(() => resolve(null), 1000);
      });
    } catch (error) {
      return null;
    }
  }
  return null;
};

// Track page view
export const trackPageView = async (page, pageTitle, userId = null) => {
  try {
    const sessionId = getSessionId();
    const referrer = document.referrer || '';
    const userAgent = navigator.userAgent;
    
    // Get GA client ID
    const gaClientId = await getGAClientId();
    
    // Track with Google Analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'G-X3WN8RYCQ5', {
        page_path: page,
        page_title: pageTitle
      });
    }

    // Track with our own system
    await API.post('/api/analytics/track', {
      sessionId,
      page,
      pageTitle,
      referrer,
      userAgent,
      userId,
      gaClientId,
      gaSessionId: sessionId
    });
  } catch (error) {
    console.error('Error tracking page view:', error);
  }
};

// Track event
export const trackEvent = async (name, category, action, label, value) => {
  try {
    const sessionId = getSessionId();
    
    // Track with Google Analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value
      });
    }

    // Track with our own system
    await API.post('/api/analytics/track/event', {
      sessionId,
      name,
      category,
      action,
      label,
      value
    });
  } catch (error) {
    console.error('Error tracking event:', error);
  }
};

// Track time spent
let timeSpentInterval = null;
let currentPageStart = Date.now();

export const startTimeTracking = () => {
  currentPageStart = Date.now();
  
  // Clear existing interval
  if (timeSpentInterval) {
    clearInterval(timeSpentInterval);
  }

  // Track time every 30 seconds
  timeSpentInterval = setInterval(async () => {
    const timeSpent = Math.floor((Date.now() - currentPageStart) / 1000);
    if (timeSpent > 0) {
      try {
        const sessionId = getSessionId();
        await API.post('/api/analytics/track', {
          sessionId,
          timeSpent
        });
      } catch (error) {
        console.error('Error tracking time:', error);
      }
    }
  }, 30000); // Every 30 seconds
};

export const stopTimeTracking = () => {
  if (timeSpentInterval) {
    clearInterval(timeSpentInterval);
    timeSpentInterval = null;
  }
};

// Track conversion events
export const trackSignUp = async (userId) => {
  await trackEvent('signup', 'conversion', 'signup', 'user_signed_up', 1);
  // Update analytics record
  try {
    const sessionId = getSessionId();
    await API.post('/api/analytics/track', {
      sessionId,
      userId,
      signedUp: true
    });
  } catch (error) {
    console.error('Error tracking signup:', error);
  }
};

export const trackSubscription = async (userId, subscriptionId) => {
  await trackEvent('subscription', 'conversion', 'subscription', 'user_subscribed', 1);
  // Update analytics record
  try {
    const sessionId = getSessionId();
    await API.post('/api/analytics/track', {
      sessionId,
      userId,
      hasSubscription: true,
      subscriptionId
    });
  } catch (error) {
    console.error('Error tracking subscription:', error);
  }
};
