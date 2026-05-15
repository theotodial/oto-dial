/**
 * Skips projected-credit exposure + outbound reserve/attempt charge (local testing only).
 *
 * Rules:
 * - Never when NODE_ENV is production.
 * - Opt-in only: CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS=true
 * - Opt-out of opt-in: CALL_DEBUG_FORCE_REAL_BILLING=true
 *
 * Development no longer auto-skips billing — test calls must deduct credits unless
 * explicitly opted out.
 */
export function allowOutboundCreditDebugBypass() {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    return false;
  }
  if (String(process.env.CALL_DEBUG_FORCE_REAL_BILLING || "").trim() === "true") {
    return false;
  }
  return (
    String(process.env.CALL_DEBUG_ALLOW_OUTBOUND_WITHOUT_CREDITS || "").trim() === "true"
  );
}
