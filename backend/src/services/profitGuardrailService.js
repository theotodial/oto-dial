import User from "../models/User.js";
import { emitAdminThrottleEvent } from "./adminLiveEventsService.js";
import { isSafeDeploymentMode } from "./deploymentModeService.js";

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function overridesActive(overrides) {
  if (!overrides || typeof overrides !== "object") return false;
  const exp = overrides.expiresAt ? new Date(overrides.expiresAt).getTime() : null;
  if (Number.isFinite(exp) && exp <= Date.now()) return false;
  return true;
}

export async function getUserProfitGuardrails(userId) {
  if (!userId) {
    return {
      throttleDelayMs: 0,
      reservationMultiplier: 1,
      maxConcurrentCalls: null,
      riskFlags: null,
      riskOverrides: null,
      sources: {},
    };
  }
  const user = await User.findById(userId)
    .select("riskFlags riskOverrides")
    .lean();
  const flags = user?.riskFlags || {};
  const overrides = user?.riskOverrides || {};
  const useOverrides = overridesActive(overrides);

  const agentThrottle = clamp(flags.throttleDelayMs ?? 0, 0, 3000);
  const agentReservation = clamp(flags.reservationMultiplier ?? 1, 1, 2);
  const agentMaxConcurrent = Number.isFinite(Number(flags.maxConcurrentCalls))
    ? Math.max(1, Number(flags.maxConcurrentCalls))
    : null;

  let throttleDelayMs = agentThrottle;
  let reservationMultiplier = agentReservation;
  let maxConcurrentCalls = agentMaxConcurrent;
  const sources = {
    throttleDelayMs: "agent",
    reservationMultiplier: "agent",
    maxConcurrentCalls: "agent",
  };

  if (useOverrides) {
    if (overrides.throttleDelayMs != null && Number.isFinite(Number(overrides.throttleDelayMs))) {
      throttleDelayMs = clamp(overrides.throttleDelayMs, 0, 3000);
      sources.throttleDelayMs = "override";
    }
    if (overrides.reservationMultiplier != null && Number.isFinite(Number(overrides.reservationMultiplier))) {
      reservationMultiplier = clamp(overrides.reservationMultiplier, 1, 2);
      sources.reservationMultiplier = "override";
    }
    if (overrides.maxConcurrentCalls != null && Number.isFinite(Number(overrides.maxConcurrentCalls))) {
      maxConcurrentCalls = Math.max(1, Math.min(10, Math.floor(Number(overrides.maxConcurrentCalls))));
      sources.maxConcurrentCalls = "override";
    }
  }

  if (isSafeDeploymentMode()) {
    const cap = Math.max(1, Math.floor(Number(process.env.SAFE_MODE_MAX_OUTBOUND_CONCURRENT || 2)));
    if (maxConcurrentCalls == null) {
      maxConcurrentCalls = cap;
      sources.maxConcurrentCalls = "safe_mode_default";
    } else {
      const next = Math.min(Number(maxConcurrentCalls), cap);
      if (next !== maxConcurrentCalls) {
        sources.maxConcurrentCalls = `${sources.maxConcurrentCalls}+safe_cap`;
      }
      maxConcurrentCalls = next;
    }
  }

  return {
    throttleDelayMs,
    reservationMultiplier,
    maxConcurrentCalls,
    riskFlags: flags,
    riskOverrides: useOverrides ? overrides : null,
    sources,
  };
}

export async function applyOutboundProfitThrottle({ userId, callId = null }) {
  const guardrails = await getUserProfitGuardrails(userId);
  const delayMs = Number(guardrails.throttleDelayMs || 0);
  if (delayMs > 0) {
    emitAdminThrottleEvent({
      eventType: "profit_guardrail_throttle",
      userId: userId ? String(userId) : null,
      callId: callId ? String(callId) : null,
      delayMs,
      source: "profit_guardrail",
    });
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return guardrails;
}

export function getReservationMultiplierFromGuardrails(guardrails) {
  return clamp(guardrails?.reservationMultiplier ?? 1, 1, 2);
}
