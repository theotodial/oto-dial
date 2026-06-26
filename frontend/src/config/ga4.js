/**
 * GA4 configuration — single source for measurement ID and feature flags.
 * Vite exposes VITE_* vars to the browser; never put API secrets here.
 */

export const GA4_MEASUREMENT_ID =
  import.meta.env.VITE_GA4_MEASUREMENT_ID || 'G-X3WN8RYCQ5';

/** Explicit override: VITE_GA4_ENABLED=true|false. Default: production only. */
export function isGa4Enabled() {
  const flag = import.meta.env.VITE_GA4_ENABLED;
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return import.meta.env.PROD === true;
}

export function isGa4Debug() {
  return import.meta.env.VITE_GA4_DEBUG === 'true' || import.meta.env.VITE_GA4_DEBUG === '1';
}

/** Internal OTODIAL event → GA4 recommended / custom event name */
export const GA4_EVENT_MAP = {
  homepage_visit: 'page_view',
  pricing_view: 'view_item',
  features_view: 'view_item',
  landing_view: 'page_view',
  signup_started: 'signup_started',
  signup_completed: 'sign_up',
  email_verified: 'email_verified',
  login: 'login',
  logout: 'logout',
  password_reset: 'password_reset',
  profile_updated: 'profile_updated',
  subscription_selected: 'select_item',
  begin_checkout: 'begin_checkout',
  payment_success: 'payment_success',
  payment_failed: 'payment_failed',
  purchase: 'purchase',
  subscription_purchased: 'subscribe',
  subscription_created: 'subscribe',
  subscription_renewed: 'subscription_renewed',
  subscription_cancelled: 'subscription_cancelled',
  credit_purchased: 'credit_purchase',
  telecom_credit_consumed: 'telecom_credit_consumed',
  number_purchased: 'number_purchase',
  number_provisioned: 'number_provisioned',
  number_provision_failed: 'number_failed',
  call_started: 'call_started',
  call_outgoing: 'outgoing_call',
  call_incoming: 'incoming_call',
  call_completed: 'call_completed',
  call_failed: 'call_failed',
  first_call: 'first_call',
  sms_sent: 'sms_sent',
  sms_received: 'sms_received',
  dashboard_opened: 'dashboard_opened',
  admin_login: 'admin_login',
  admin_logout: 'admin_logout',
  analytics_opened: 'analytics_opened',
  dashboard_opened: 'dashboard_opened'
};

/**
 * Events sent server-side via Measurement Protocol only — never duplicate in gtag.
 */
export const GA4_SERVER_ONLY_EVENTS = new Set([
  'purchase',
  'subscription_purchased',
  'subscription_created',
  'subscription_renewed',
  'payment_success',
  'credit_purchased',
  'number_purchased',
  'number_provisioned'
]);

export default {
  GA4_MEASUREMENT_ID,
  isGa4Enabled,
  isGa4Debug,
  GA4_EVENT_MAP,
  GA4_SERVER_ONLY_EVENTS
};
