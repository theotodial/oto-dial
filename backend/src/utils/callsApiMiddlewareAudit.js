/**
 * Structured audit logs for the /api/calls middleware chain (POST outbound create).
 * Reduces noise by only logging when the request targets /api/calls.
 */

export function isCallsApiRequest(req) {
  const u = String(req.originalUrl || req.url || "");
  return u === "/api/calls" || u.startsWith("/api/calls/");
}

export function logMiddlewareEnter(middlewareName, req, extra = {}) {
  if (!isCallsApiRequest(req)) return;
  console.log("[MIDDLEWARE ENTER]", {
    middleware: middlewareName,
    userId: req.userId ? String(req.userId) : null,
    method: req.method,
    path: req.originalUrl || req.path,
    ...extra,
  });
}

export function logMiddlewarePass(middlewareName, req, extra = {}) {
  if (!isCallsApiRequest(req)) return;
  console.log("[MIDDLEWARE PASS]", {
    middleware: middlewareName,
    userId: req.userId ? String(req.userId) : null,
    method: req.method,
    path: req.originalUrl || req.path,
    ...extra,
  });
}

export function logMiddlewareBlock(middlewareName, req, { status, reason, body }) {
  if (!isCallsApiRequest(req)) return;
  console.warn("[MIDDLEWARE BLOCK]", {
    middleware: middlewareName,
    userId: req.userId ? String(req.userId) : null,
    method: req.method,
    path: req.originalUrl || req.path,
    reason: reason ?? null,
    httpStatus: status,
    responseBody: body ?? null,
  });
}
