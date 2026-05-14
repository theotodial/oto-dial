/**
 * Multi-call budget: block new outbound reservation when projected liquidity is insufficient.
 */

import { computeProjectedUserBalance } from "./projectedBalanceService.js";
import { CREDIT_RULES } from "../config/creditConfig.js";
import {
  getUserProfitGuardrails,
  getReservationMultiplierFromGuardrails,
} from "./profitGuardrailService.js";
import { emitAdminThrottleEvent } from "./adminLiveEventsService.js";

function logExposure(event, details = {}) {
  console.log("[ECONOMIC EXPOSURE]", { event, ...details, t: new Date().toISOString() });
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {object} [opts]
 * @param {number} [opts.additionalReservation] — credits the new outbound min-reserve would hold
 */
export async function evaluateOutboundCreditExposure(userId, opts = {}) {
  const additionalReservation = Math.max(0, Number(opts.additionalReservation || 0));
  const projection = await computeProjectedUserBalance(userId);
  if (projection.error) {
    return { ok: false, code: projection.error, projection };
  }

  const projectedAfterNewReserve =
    Number(projection.projectedAvailableCredits) - additionalReservation;

  const ok = projectedAfterNewReserve >= -1e-6;
  return {
    ok,
    code: ok ? null : "INSUFFICIENT_PROJECTED_CREDITS",
    projection,
    additionalReservation,
    projectedAfterNewReserve,
  };
}

/**
 * Compute hold for outbound guard (same formula as reserve path, without persisting).
 */
export async function computeOutboundReservationHold(userId, reservationMultiplierOpt) {
  const mult =
    Number(reservationMultiplierOpt || 0) > 0
      ? Number(reservationMultiplierOpt)
      : getReservationMultiplierFromGuardrails(await getUserProfitGuardrails(userId));
  const hold = Math.max(
    CREDIT_RULES.callReservationMinimum,
    Math.ceil(CREDIT_RULES.callReservationMinimum * mult)
  );
  return { hold, reservationMultiplier: mult };
}

/**
 * Full guard before creating a new outbound call document (read-only check).
 */
export async function assertOutboundCreditExposureForNewCall(userId, reservationMultiplierOpt) {
  const { hold } = await computeOutboundReservationHold(userId, reservationMultiplierOpt);
  const result = await evaluateOutboundCreditExposure(userId, { additionalReservation: hold });
  if (!result.ok) {
    logExposure("reject_outbound", {
      userId: String(userId),
      code: result.code,
      hold,
      projectedAvailableCredits: result.projection?.projectedAvailableCredits,
    });
    emitAdminThrottleEvent({
      reason: "INSUFFICIENT_PROJECTED_CREDITS",
      userId: String(userId),
      hold,
      projectedAvailableCredits: result.projection?.projectedAvailableCredits,
      pendingEconomicExposure: result.projection?.pendingEconomicExposure,
      activeCalls: result.projection?.activeCalls?.length ?? 0,
    });
  }
  return { ...result, hold };
}
