/**
 * Authoritative outbound dial credit gate (backend only).
 */
import { getUserCreditSnapshot } from "./creditLedgerService.js";
import { assertOutboundCreditExposureForNewCall } from "./economicExposureGuard.js";
import { allowOutboundCreditDebugBypass } from "../utils/outboundCreditDebugBypass.js";

export async function assertUserHasOutboundDialCredits(userId, reservationMultiplierOpt) {
  if (allowOutboundCreditDebugBypass()) {
    return { ok: true, debugBypass: true };
  }

  const snap = await getUserCreditSnapshot(userId);
  if (!snap) {
    return { ok: false, code: "USER_NOT_FOUND" };
  }

  const remaining = Number(snap.remainingCredits || 0);
  const reserved = Number(snap.reservedCredits || 0);
  const available = remaining - reserved;

  if (remaining <= 0 || available <= 0) {
    return {
      ok: false,
      code: "INSUFFICIENT_CREDITS",
      remainingCredits: remaining,
      reservedCredits: reserved,
      availableCredits: available,
    };
  }

  const exposure = await assertOutboundCreditExposureForNewCall(
    userId,
    reservationMultiplierOpt
  );
  if (!exposure.ok) {
    return {
      ok: false,
      code: exposure.code || "INSUFFICIENT_PROJECTED_CREDITS",
      remainingCredits: remaining,
      projection: exposure.projection || null,
    };
  }

  return {
    ok: true,
    remainingCredits: remaining,
    availableCredits: available,
    hold: exposure.hold,
  };
}
