const memoryCache = new Map();

export function cachedFetch(key, fn) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  const promise = Promise.resolve()
    .then(fn)
    .catch((error) => {
      memoryCache.delete(key);
      throw error;
    });

  memoryCache.set(key, promise);
  return promise;
}

export function clearCachedFetch(key) {
  memoryCache.delete(key);
}

export function readJsonStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function removeStorageKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
