import { clearCachedFetch } from "./appCache";

export const BOOTSTRAP_REFRESH_EVENT = "otodial:subscription-refresh";
export const BOOTSTRAP_REFRESH_STORAGE_KEY = "otodial_subscription_refresh";

export function invalidateBootstrapCache() {
  clearCachedFetch("auth:/api/app/bootstrap");
}

export function shouldRefreshSubscription(detail, currentUserId) {
  const targetUserId = detail?.userId ? String(detail.userId) : null;
  if (!targetUserId || !currentUserId) {
    return true;
  }

  return String(currentUserId) === targetUserId;
}

export function notifySubscriptionChanged({ reason = "unknown", userId = null } = {}) {
  invalidateBootstrapCache();

  if (typeof window === "undefined") {
    return;
  }

  const detail = {
    reason,
    userId: userId ? String(userId) : null,
    at: Date.now(),
  };

  try {
    window.localStorage.setItem(
      BOOTSTRAP_REFRESH_STORAGE_KEY,
      JSON.stringify(detail)
    );
  } catch (_) {
    /* ignore storage failures */
  }

  window.dispatchEvent(
    new CustomEvent(BOOTSTRAP_REFRESH_EVENT, {
      detail,
    })
  );
}
