// Canonical analytics event taxonomy.
// Keep in sync with backend/src/constants/analyticsEvents.js
export const ANALYTICS_EVENTS = {
  // Page / marketing
  HOMEPAGE_VISIT: 'homepage_visit',
  PRICING_VIEW: 'pricing_view',
  FEATURES_VIEW: 'features_view',
  LANDING_VIEW: 'landing_view',

  // Auth lifecycle
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  EMAIL_VERIFIED: 'email_verified',
  LOGIN: 'login',
  LOGOUT: 'logout',

  // Commerce
  BEGIN_CHECKOUT: 'begin_checkout',
  PURCHASE: 'purchase',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
  SUBSCRIPTION_PURCHASED: 'subscription_purchased',
  CREDIT_PURCHASED: 'credit_purchased',

  // Numbers
  NUMBER_PURCHASED: 'number_purchased',
  NUMBER_PROVISION_FAILED: 'number_provision_failed',

  // Telephony
  FIRST_CALL: 'first_call',
  CALL_OUTGOING: 'call_outgoing',
  CALL_INCOMING: 'call_incoming',
  CALL_COMPLETED: 'call_completed',
  CALL_FAILED: 'call_failed',

  // Messaging
  SMS_SENT: 'sms_sent',

  // Account
  PROFILE_UPDATED: 'profile_updated',
  DASHBOARD_OPENED: 'dashboard_opened',
  ANALYTICS_OPENED: 'analytics_opened',
  ADMIN_LOGIN: 'admin_login'
};

export default ANALYTICS_EVENTS;
