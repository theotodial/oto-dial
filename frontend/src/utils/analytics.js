// Backward-compatible shim — all traffic flows through analyticsClient.
import {
  trackPageView as clientTrackPageView,
  track as clientTrack,
  trackSignUpEvent,
  identify
} from './analyticsClient';
import { ANALYTICS_EVENTS } from '../constants/analyticsEvents';

export const trackPageView = (page, pageTitle, userId = null) => {
  clientTrackPageView(page, pageTitle, userId);
};

export const trackEvent = (name, category, action, label, value) => {
  clientTrack(name || action, { category, action, label }, { value: value || 0, category: category || 'general' });
};

export const startTimeTracking = () => {};
export const stopTimeTracking = () => {};

export const trackSignUp = (userId) => {
  trackSignUpEvent(userId);
};

/**
 * Subscription conversions are recorded server-side (Stripe webhook + MP).
 * Client only logs internal analytics — never duplicates GA4 purchase events.
 */
export const trackSubscription = (userId, subscriptionId, details = {}) => {
  if (userId) identify(userId, { plan: details.planName });
  clientTrack(
    ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED,
    {
      subscriptionId,
      transactionId: details.transactionId || subscriptionId,
      planId: details.planId,
      planName: details.planName,
      source: 'client_confirmation'
    },
    {
      value: details.value || 0,
      currency: details.currency || 'usd',
      ga: false
    }
  );
};

export default {
  trackPageView,
  trackEvent,
  startTimeTracking,
  stopTimeTracking,
  trackSignUp,
  trackSubscription
};
