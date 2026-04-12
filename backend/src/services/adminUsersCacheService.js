const ADMIN_USERS_CACHE_TTL_MS = 30_000;
const adminUsersCache = globalThis.__otoDialAdminUsersCache || new Map();

if (!globalThis.__otoDialAdminUsersCache) {
  globalThis.__otoDialAdminUsersCache = adminUsersCache;
}

export function readAdminUsersCache(key) {
  const hit = adminUsersCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    adminUsersCache.delete(key);
    return null;
  }
  return hit.value;
}

export function writeAdminUsersCache(key, value) {
  adminUsersCache.set(key, {
    value,
    expiresAt: Date.now() + ADMIN_USERS_CACHE_TTL_MS,
  });
}

export function clearAdminUsersCache() {
  adminUsersCache.clear();
}
