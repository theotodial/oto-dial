/**
 * Normalize VITE_API_URL for the browser bundle.
 *
 * Common production misconfiguration: VITE_API_URL=https://otodial.com/api
 * while every API path already starts with /api/... — axios then resolves to
 * https://otodial.com/api/api/... (broken → bootstrap/auth failures, blank UI).
 */
export function normalizeViteApiBaseUrl(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  let urlStr = s.replace(/\/+$/, "");
  try {
    const u = new URL(urlStr);
    const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
    if (path === "/api") {
      u.pathname = "/";
      return u.origin;
    }
    return urlStr;
  } catch {
    return urlStr;
  }
}

/** Origin (scheme + host + port) for Socket.IO and absolute links. */
export function viteApiOriginForSockets(rawEnv) {
  const base = normalizeViteApiBaseUrl(rawEnv);
  if (!base) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
    return "";
  }
  try {
    return new URL(base).origin;
  } catch {
    return typeof window !== "undefined" ? window.location.origin : "";
  }
}
