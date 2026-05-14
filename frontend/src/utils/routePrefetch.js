/**
 * Warm lazy route chunks on hover/focus before navigation.
 * Uses the same module specifiers as routes/lazyPages.jsx so Vite merges into existing chunks.
 */

const ROUTE_CHUNKS = {
  '/': () => import('../pages/Home.jsx'),
  '/signup': () => import('../pages/Signup.jsx'),
  '/login': () => import('../pages/Login.jsx'),
  '/forgot-password': () => import('../pages/ForgotPassword.jsx'),
  '/reset-password': () => import('../pages/ResetPassword.jsx'),
  '/oauth/consent': () => import('../pages/OAuthConsent.jsx'),
  '/oauth-success': () => import('../pages/OAuthSuccess.jsx'),
  '/recents': () => import('../pages/Recents.jsx'),
  '/voice': () => import('../pages/Recents.jsx'),
  '/campaign': () => import('../pages/Campaign.jsx'),
  '/dashboard': () => import('../pages/Dashboard.jsx'),
  '/contacts': () => import('../pages/Contacts.jsx'),
  '/billing': () => import('../pages/Billing.jsx'),
  '/buy-number': () => import('../pages/BuyNumber.jsx'),
  '/subscription-details': () => import('../pages/SubscriptionDetails.jsx'),
  '/profile': () => import('../pages/Profile.jsx'),
  '/support': () => import('../pages/Support.jsx'),
  '/contact': () => import('../pages/Contact.jsx'),
  '/privacy': () => import('../pages/Privacy.jsx'),
  '/terms': () => import('../pages/Terms.jsx'),
  '/affiliate': () => import('../pages/AffiliateLanding.jsx'),
  '/affiliate/signup': () => import('../pages/AffiliateSignup.jsx'),
  '/affiliate/login': () => import('../pages/AffiliateLogin.jsx'),
  '/affiliate/oauth-success': () => import('../pages/AffiliateOAuthSuccess.jsx'),
  '/affiliate/dashboard': () => import('../pages/AffiliateDashboard.jsx'),
  '/adminbobby': () => import('../pages/admin/AdminLogin.jsx'),
  '/blog': () => import('../pages/Blog.jsx'),
};

const started = new Set();

export function normalizePrefetchPath(path) {
  if (!path || typeof path !== 'string') return '/';
  const noHash = path.split('#')[0] || '/';
  const noQuery = noHash.split('?')[0] || '/';
  let p = noQuery.trim() || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function prefetchRouteChunk(pathname) {
  const key = normalizePrefetchPath(pathname);
  const loader = ROUTE_CHUNKS[key];
  if (!loader || started.has(key)) return;
  started.add(key);
  loader().catch(() => {
    started.delete(key);
  });
}

/** Defer work until the browser is idle so hover does not compete with paint. */
export function schedulePrefetch(pathname) {
  if (typeof window === 'undefined') return;
  const run = () => prefetchRouteChunk(pathname);
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    window.setTimeout(run, 0);
  }
}

export function prefetchPathFromTo(to) {
  if (typeof to === 'string') {
    schedulePrefetch(to);
    return;
  }
  if (to && typeof to === 'object' && typeof to.pathname === 'string') {
    schedulePrefetch(to.pathname);
  }
}
