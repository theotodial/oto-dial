/** Production-safe browser diagnostics surface (read-only-ish object on `window`). */
export function ensureOtodialDebug() {
  if (typeof window === 'undefined') return null;
  if (!window.OTODIAL_DEBUG || typeof window.OTODIAL_DEBUG !== 'object') {
    window.OTODIAL_DEBUG = {};
  }
  window.__OTODIAL_DEBUG__ = window.OTODIAL_DEBUG;
  return window.OTODIAL_DEBUG;
}
