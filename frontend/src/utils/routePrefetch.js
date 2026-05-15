/**
 * Route prefetch disabled — dynamic imports here conflicted with eager route modules
 * and contributed to unstable chunk graphs. Re-enable only after chunking is stable.
 */

export function normalizePrefetchPath(path) {
  if (!path || typeof path !== 'string') return '/';
  const noHash = path.split('#')[0] || '/';
  const noQuery = noHash.split('?')[0] || '/';
  let p = noQuery.trim() || '/';
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

export function prefetchRouteChunk() {}

export function schedulePrefetch() {}

export function prefetchPathFromTo() {}
