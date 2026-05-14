/**
 * Skips projected-credit exposure + outbound reserve/attempt charge so POST /api/calls
 * can succeed without a full billing ledger (typical local Mongo with no credits).
 *
 * Rules:
 * - Never when NODE_ENV is production.
 * - Opt-out on any env: CALL_DEBUG_FORCE_REAL_BILLING=true
 * - Opt-in on any non-production: CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS=true
 * - Else auto when NODE_ENV=development OR app URLs look local (localhost / 127.0.0.1).
 */
export function allowOutboundCreditDebugBypass() {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    return false;
  }
  if (String(process.env.CALL_DEBUG_FORCE_REAL_BILLING || "").trim() === "true") {
    return false;
  }
  if (String(process.env.CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS || "").trim() === "true") {
    return true;
  }
  if (String(process.env.NODE_ENV || "").toLowerCase() === "development") {
    return true;
  }
  const urls = [process.env.FRONTEND_URL, process.env.BACKEND_URL, process.env.APP_URL]
    .filter(Boolean)
    .join(" ");
  if (/\blocalhost\b|127\.0\.0\.1/.test(String(urls))) {
    return true;
  }
  return false;
}
