// Analytics tracking utility — never block navigation (fire-and-forget to API)
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

// Get Google Analytics client ID (non-blocking for callers)
const getGAClientId = async () => {
  if (typeof window !== 'undefined' && window.gtag) {
    try {
      return new Promise((resolve) => {
        window.gtag('get', 'G-X3WN8RYCQ5', 'client_id', (clientId) => {
          resolve(clientId || null);
        });
        setTimeout(() => resolve(null), 1000);
      });
    } catch (error) {
      return null;
    }
  }
  return null;
};

async function trackPageViewWork(page, pageTitle, userId = null) {
  try {
    const sessionId = getSessionId();
    const referrer = document.referrer || '';
    const userAgent = navigator.userAgent;
    const landingUrl = typeof window !== 'undefined' ? window.location.href : '';
    const searchParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search || '')
      : new URLSearchParams();
    const utmSource = searchParams.get('utm_source') || null;
    const utmMedium = searchParams.get('utm_medium') || null;
    const utmCampaign = searchParams.get('utm_campaign') || null;
    const utmTerm = searchParams.get('utm_term') || null;
    const utmContent = searchParams.get('utm_content') || null;
    const sourceHint = searchParams.get('source') || searchParams.get('src') || null;
    const gclid = searchParams.get('gclid') || null;
    const fbclid = searchParams.get('fbclid') || null;
    const ttclid = searchParams.get('ttclid') || null;
    const msclkid = searchParams.get('msclkid') || null;
    const twclid = searchParams.get('twclid') || null;
    const scid = searchParams.get('scid') || null;

    const gaClientId = await getGAClientId();

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'G-X3WN8RYCQ5', {
        page_path: page,
        page_title: pageTitle
      });
    }

    void API.post('/api/analytics/track', {
      sessionId,
      page,
      pageTitle,
      referrer,
      userAgent,
      userId,
      gaClientId,
      gaSessionId: sessionId,
      landingUrl,
      sourceHint,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      gclid,
      fbclid,
      ttclid,
      msclkid,
      twclid,
      scid
    });
  } catch (error) {
    console.error('Error tracking page view:', error);
  }
}

export const trackPageView = (page, pageTitle, userId = null) => {
  queueMicrotask(() => {
    trackPageViewWork(page, pageTitle, userId).catch(() => {});
  });
};

async function trackEventWork(name, category, action, label, value) {
  try {
    const sessionId = getSessionId();

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value
      });
    }

    void API.post('/api/analytics/track/event', {
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
}

export const trackEvent = (name, category, action, label, value) => {
  queueMicrotask(() => {
    trackEventWork(name, category, action, label, value).catch(() => {});
  });
};

let timeSpentInterval = null;
let currentPageStart = Date.now();

export const startTimeTracking = () => {
  currentPageStart = Date.now();

  if (timeSpentInterval) {
    clearInterval(timeSpentInterval);
  }

  timeSpentInterval = setInterval(() => {
    const timeSpent = Math.floor((Date.now() - currentPageStart) / 1000);
    if (timeSpent > 0) {
      try {
        const sessionId = getSessionId();
        void API.post('/api/analytics/track', {
          sessionId,
          timeSpent
        });
      } catch (error) {
        console.error('Error tracking time:', error);
      }
    }
  }, 30000);
};

export const stopTimeTracking = () => {
  if (timeSpentInterval) {
    clearInterval(timeSpentInterval);
    timeSpentInterval = null;
  }
};

export const trackSignUp = (userId) => {
  trackEvent('signup', 'conversion', 'signup', 'user_signed_up', 1);
  try {
    const sessionId = getSessionId();
    void API.post('/api/analytics/track', {
      sessionId,
      userId,
      signedUp: true
    });
  } catch (error) {
    console.error('Error tracking signup:', error);
  }
};

export const trackSubscription = (userId, subscriptionId) => {
  trackEvent('subscription', 'conversion', 'subscription', 'user_subscribed', 1);
  try {
    const sessionId = getSessionId();
    void API.post('/api/analytics/track', {
      sessionId,
      userId,
      hasSubscription: true,
      subscriptionId
    });
  } catch (error) {
    console.error('Error tracking subscription:', error);
  }
};
