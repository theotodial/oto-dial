// Enterprise analytics client: stable visitor identity, batched internal
// collection (sendBeacon), and centralized GA4 integration (single init).
import API from '../api';
import { ANALYTICS_EVENTS } from '../constants/analyticsEvents';
import {
  GA4_MEASUREMENT_ID,
  isGa4Enabled,
  isGa4Debug,
  GA4_EVENT_MAP,
  GA4_SERVER_ONLY_EVENTS
} from '../config/ga4';

const COLLECT_PATH = '/api/analytics/collect';
const VISITOR_KEY = 'oto_vid';
const SESSION_KEY = 'oto_sid';
const SESSION_LAST_ACTIVITY_KEY = 'oto_sid_last';
const SESSION_LANDING_KEY = 'oto_sid_landing';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 4000;
const MAX_QUEUE = 30;

let flushTimer = null;
const queue = [];
let pendingPageView = null;
let currentUserId = null;
let currentUserTraits = {};
let gaClientIdCache = null;
let gaScriptLoaded = false;
let gaInitialized = false;
let serverReachable = true;
const gaSentEventIds = new Set();

const gaDebug = {
  connected: false,
  measurementId: GA4_MEASUREMENT_ID,
  clientId: null,
  sessionId: null,
  userId: null,
  eventsSent: 0,
  eventsFailed: 0,
  lastEvent: null,
  lastPurchase: null,
  lastSignup: null,
  queueLength: () => queue.length
};

if (typeof window !== 'undefined') {
  window.__otoGa4Debug = gaDebug;
}

function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* noop */
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function safeLocalGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeLocalSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function getVisitorId() {
  let id = safeLocalGet(VISITOR_KEY);
  if (!id) {
    id = uuid();
    safeLocalSet(VISITOR_KEY, id);
    fireGa4Once('first_visit', { visitor_id: id });
  }
  gaDebug.sessionId = getSessionId();
  return id;
}

function getSessionId() {
  const now = Date.now();
  const last = Number(safeLocalGet(SESSION_LAST_ACTIVITY_KEY) || 0);
  let sid = safeLocalGet(SESSION_KEY);
  const isNew = !sid || !last || now - last > SESSION_IDLE_MS;

  if (isNew) {
    sid = uuid();
    safeLocalSet(SESSION_KEY, sid);
    safeLocalSet(SESSION_LANDING_KEY, typeof window !== 'undefined' ? window.location.href : '');
    fireGa4Once('session_start', { session_id: sid });
  }
  safeLocalSet(SESSION_LAST_ACTIVITY_KEY, String(now));
  gaDebug.sessionId = sid;
  return sid;
}

function loadGa4Script() {
  if (!isGa4Enabled() || gaScriptLoaded || typeof window === 'undefined') return;
  gaScriptLoaded = true;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
  script.onload = () => {
    gtag('js', new Date());
    gtag('config', GA4_MEASUREMENT_ID, {
      send_page_view: false,
      debug_mode: isGa4Debug(),
      allow_google_signals: true,
      allow_ad_personalization_signals: false
    });
    gaInitialized = true;
    gaDebug.connected = true;
    getGAClientId().then((id) => {
      gaDebug.clientId = id;
    });
    if (currentUserId) {
      gtag('config', GA4_MEASUREMENT_ID, { user_id: currentUserId });
    }
  };
  document.head.appendChild(script);
}

function gaReady() {
  return isGa4Enabled() && gaInitialized && typeof window !== 'undefined' && window.gtag;
}

function mapGa4EventName(internalName) {
  return GA4_EVENT_MAP[internalName] || internalName;
}

function shouldSendToGa4(internalName) {
  if (!isGa4Enabled()) return false;
  if (GA4_SERVER_ONLY_EVENTS.has(internalName)) return false;
  return true;
}

function fireGa4Once(eventName, params = {}) {
  if (!shouldSendToGa4(eventName) && !['session_start', 'first_visit', 'page_view'].includes(eventName)) {
    return;
  }
  loadGa4Script();
  if (!window.gtag) {
    const tryFire = () => {
      if (window.gtag) {
        window.gtag('event', eventName, params);
        gaDebug.eventsSent += 1;
        gaDebug.lastEvent = { name: eventName, at: new Date().toISOString(), params };
      }
    };
    setTimeout(tryFire, 500);
    return;
  }
  try {
    window.gtag('event', eventName, params);
    gaDebug.eventsSent += 1;
    gaDebug.lastEvent = { name: eventName, at: new Date().toISOString(), params };
  } catch {
    gaDebug.eventsFailed += 1;
  }
}

function fireGa4Event(internalName, props = {}, { value, currency, eventId } = {}) {
  if (!shouldSendToGa4(internalName)) return;
  const gaName = mapGa4EventName(internalName);
  if (eventId && gaSentEventIds.has(eventId)) return;
  if (eventId) gaSentEventIds.add(eventId);

  const params = {
    ...props,
    oto_event: internalName,
    oto_visitor_id: getVisitorId(),
    oto_session_id: getSessionId(),
    value: value || undefined,
    currency: currency ? String(currency).toUpperCase() : undefined
  };

  loadGa4Script();
  const dispatch = () => fireGa4Once(gaName, params);

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(dispatch, { timeout: 2000 });
  } else {
    setTimeout(dispatch, 0);
  }

  if (gaName === 'sign_up') gaDebug.lastSignup = gaDebug.lastEvent;
  if (gaName === 'purchase') gaDebug.lastPurchase = gaDebug.lastEvent;
}

function getGAClientId() {
  if (gaClientIdCache) return Promise.resolve(gaClientIdCache);
  if (typeof window === 'undefined' || !window.gtag) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      gaClientIdCache = val || null;
      gaDebug.clientId = gaClientIdCache;
      resolve(gaClientIdCache);
    };
    try {
      window.gtag('get', GA4_MEASUREMENT_ID, 'client_id', (clientId) => done(clientId));
    } catch {
      done(null);
    }
    setTimeout(() => done(null), 800);
  });
}

function readUtm() {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search || '');
  return {
    utmSource: p.get('utm_source') || null,
    utmMedium: p.get('utm_medium') || null,
    utmCampaign: p.get('utm_campaign') || null,
    utmTerm: p.get('utm_term') || null,
    utmContent: p.get('utm_content') || null,
    gclid: p.get('gclid') || null,
    fbclid: p.get('fbclid') || null,
    ttclid: p.get('ttclid') || null,
    msclkid: p.get('msclkid') || null,
    twclid: p.get('twclid') || null,
    scid: p.get('scid') || null,
    sourceHint: p.get('source') || p.get('src') || null
  };
}

function buildContext() {
  if (typeof window === 'undefined') return {};
  const nav = window.navigator || {};
  const screen = window.screen || {};
  let prefersDarkMode = null;
  try {
    prefersDarkMode = window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : null;
  } catch {
    prefersDarkMode = null;
  }
  let timezone = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = null;
  }
  return {
    userAgent: nav.userAgent || null,
    language: nav.language || null,
    timezone,
    screenResolution: screen.width && screen.height ? `${screen.width}x${screen.height}` : null,
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    prefersDarkMode,
    networkType: nav.connection?.effectiveType || null,
    referrer: document.referrer || null,
    landingUrl: safeLocalGet(SESSION_LANDING_KEY) || window.location.href,
    page: `${window.location.pathname}${window.location.search || ''}`,
    gaClientId: gaClientIdCache || null,
    ...readUtm()
  };
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush(false);
  }, FLUSH_INTERVAL_MS);
}

function sendPayload(payload, useBeacon) {
  const body = JSON.stringify(payload);
  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(COLLECT_PATH, blob);
      if (ok) return;
    } catch {
      /* fall through */
    }
  }
  if (import.meta.env?.DEV && !serverReachable) return;
  void (async () => {
    const res = await API.post(COLLECT_PATH, payload);
    if (import.meta.env?.DEV && !res?.response && res?.error) {
      serverReachable = false;
    }
  })();
}

async function flush(useBeacon) {
  if (queue.length === 0) return;
  const hits = queue.splice(0, queue.length);
  const payload = {
    visitorId: getVisitorId(),
    sessionId: getSessionId(),
    userId: currentUserId,
    context: buildContext(),
    hits
  };
  sendPayload(payload, useBeacon);
}

function enqueue(hit) {
  queue.push(hit);
  if (queue.length >= MAX_QUEUE) flush(false);
  else scheduleFlush();
}

function finalizePendingPageView() {
  if (!pendingPageView) return;
  const seconds = Math.max(0, Math.round((Date.now() - pendingPageView.enteredAt) / 1000));
  if (seconds > 0) {
    enqueue({
      type: 'event',
      name: '__page_time',
      category: 'engagement',
      eventId: uuid(),
      props: { targetEventId: pendingPageView.eventId, seconds }
    });
    if (seconds >= 10) {
      fireGa4Event('user_engagement', { engagement_time_msec: seconds * 1000 }, {});
    }
  }
  pendingPageView = null;
}

// ----- Public API -----

export function identify(userId, traits = {}) {
  currentUserId = userId ? String(userId) : null;
  currentUserTraits = traits || {};
  gaDebug.userId = currentUserId;

  loadGa4Script();
  if (gaReady()) {
    const props = {
      subscription_plan: traits.plan || traits.subscriptionPlan || undefined,
      country: traits.country || undefined,
      language: traits.language || buildContext().language || undefined
    };
    window.gtag('set', 'user_properties', props);
    if (currentUserId) {
      window.gtag('config', GA4_MEASUREMENT_ID, { user_id: currentUserId });
    }
  }
}

export function initAnalytics() {
  if (!isGa4Enabled()) return;
  loadGa4Script();
  getGAClientId();
  getVisitorId();
  getSessionId();

  if (typeof window === 'undefined' || window.__otoAnalyticsInit) return;
  window.__otoAnalyticsInit = true;

  const onHide = () => {
    finalizePendingPageView();
    flush(true);
  };
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
  window.addEventListener('pagehide', onHide);
  window.addEventListener('beforeunload', onHide);

  let maxScroll = 0;
  const onScroll = () => {
    const doc = document.documentElement;
    const scrollPct = Math.round(
      ((window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1)) * 100
    );
    if (scrollPct > maxScroll && scrollPct >= 25 && scrollPct % 25 === 0) {
      maxScroll = scrollPct;
      fireGa4Event('scroll', { percent_scrolled: scrollPct }, {});
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

export function trackPageView(page, pageTitle, userId = null) {
  try {
    if (userId) identify(userId, currentUserTraits);
    getSessionId();

    finalizePendingPageView();

    const eventId = uuid();
    pendingPageView = { eventId, page, enteredAt: Date.now() };

    enqueue({
      type: 'pageview',
      eventId,
      page,
      pageTitle: pageTitle || (typeof document !== 'undefined' ? document.title : null),
      referrer: typeof document !== 'undefined' ? document.referrer : null
    });

    fireGa4Event(
      'page_view',
      {
        page_path: page,
        page_title: pageTitle,
        page_location: typeof window !== 'undefined' ? window.location.href : undefined
      },
      { eventId }
    );
  } catch {
    /* never break navigation */
  }
}

/**
 * track(name, props?, { value, currency, category, ga, eventId })
 * Internal analytics is always recorded; GA4 mirror respects server-only rules.
 */
export function track(name, props = {}, options = {}) {
  try {
    const { value = 0, currency = 'usd', category = 'general', ga = true, eventId = uuid() } = options;
    enqueue({
      type: 'event',
      name,
      category,
      value,
      currency,
      eventId,
      props
    });
    if (ga) fireGa4Event(name, props, { value, currency, eventId });
  } catch {
    /* noop */
  }
}

export function trackBeginCheckout({ planId, planName, value, currency = 'usd' } = {}) {
  track(ANALYTICS_EVENTS.BEGIN_CHECKOUT, { planId, planName }, { value, currency, ga: true });
}

/** Client-side purchase mirror — use only for non-Stripe flows; Stripe uses server MP. */
export function trackPurchase({ transactionId, value, currency = 'usd', planId, planName } = {}) {
  track(
    ANALYTICS_EVENTS.PURCHASE,
    { transactionId, planId, planName },
    { value, currency, ga: false }
  );
}

export function trackSignUpEvent(userId, props = {}) {
  if (userId) identify(userId, props);
  track(ANALYTICS_EVENTS.SIGNUP_COMPLETED, props, { ga: true });
}

export function trackLogin(userId, props = {}) {
  if (userId) identify(userId, props);
  track(ANALYTICS_EVENTS.LOGIN, props, { ga: true });
}

export function getGa4DebugState() {
  return {
    ...gaDebug,
    enabled: isGa4Enabled(),
    debugMode: isGa4Debug(),
    measurementId: GA4_MEASUREMENT_ID,
    visitorId: safeLocalGet(VISITOR_KEY),
    sessionId: safeLocalGet(SESSION_KEY),
    queueLength: queue.length
  };
}

export function flushAnalytics() {
  finalizePendingPageView();
  flush(true);
}

export default {
  initAnalytics,
  identify,
  trackPageView,
  track,
  trackBeginCheckout,
  trackPurchase,
  trackSignUpEvent,
  trackLogin,
  flushAnalytics,
  getGa4DebugState
};
