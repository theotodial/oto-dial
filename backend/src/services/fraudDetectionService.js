import Subscription from "../models/Subscription.js";
import { computeUsage } from "./usageComputationService.js";
import { getLatestSubscription } from "./subscriptionService.js";
import { detectCountryFromPhoneNumber } from "../utils/countryUtils.js";
import { getEffectiveTelecomPolicy } from "./telecomPolicyService.js";
import { emitAdminThrottleEvent } from "./adminLiveEventsService.js";

const fraudWindows = globalThis.__otoDialFraudWindows || new Map();

if (!globalThis.__otoDialFraudWindows) {
  globalThis.__otoDialFraudWindows = fraudWindows;
}

/** Soft thresholds per rolling minute — no account suspension. */
const CALL_WARN_PER_MIN = 35;
const CALL_DELAY_L2_PER_MIN = 55;
const CALL_DELAY_L3_PER_MIN = 75;
const CALL_HARD_REJECT_PER_MIN = 120;

const SMS_WARN_PER_MIN = 80;
const SMS_DELAY_L2_PER_MIN = 120;
const SMS_HARD_REJECT_PER_MIN = 220;

function getWindow(userId) {
  const key = String(userId || "");
  const now = Date.now();
  const row = fraudWindows.get(key) || {
    callTimestamps: [],
    smsTimestamps: [],
    lastFlagAt: 0,
  };

  row.callTimestamps = row.callTimestamps.filter((value) => now - value < 60_000);
  row.smsTimestamps = row.smsTimestamps.filter((value) => now - value < 60_000);
  fraudWindows.set(key, row);
  return row;
}

function emitThrottle(kind, payload) {
  try {
    emitAdminThrottleEvent({ kind, ...payload });
  } catch {
    /* non-fatal */
  }
}

/**
 * Fraud/abuse evaluation — rejects extreme API abuse only.
 * Does NOT suspend accounts or subscriptions (admin-only hard suspend).
 *
 * @returns {Promise<{
 *   allowed: boolean,
 *   blocked?: boolean,
 *   reason?: string,
 *   statusCode?: number,
 *   retryAfterMs?: number,
 *   throttleDelayMs?: number,
 *   throttleLevel?: number,
 *   destinationCountry?: string
 * }>}
 */
export async function evaluateFraudEvent({
  userId,
  channel,
  destinationNumber,
}) {
  if (!userId) {
    return { allowed: true };
  }

  const now = Date.now();
  const window = getWindow(userId);

  if (channel === "call") {
    window.callTimestamps.push(now);
    const n = window.callTimestamps.length;

    if (n >= CALL_HARD_REJECT_PER_MIN) {
      const retryAfterMs = 60_000;
      console.warn("[fraudGuard] extreme call velocity — request rejected (no account lock)", {
        userId: String(userId),
        callsLastMinute: n,
      });
      emitThrottle("fraud_velocity", {
        userId: String(userId),
        channel: "call",
        level: "reject",
        callsLastMinute: n,
      });
      return {
        allowed: false,
        blocked: false,
        reason: "Too many calls in a short period. Please wait a minute and try again.",
        statusCode: 429,
        retryAfterMs,
      };
    }

    let throttleDelayMs = 0;
    let throttleLevel = 0;
    if (n >= CALL_DELAY_L3_PER_MIN) {
      throttleDelayMs = 5000;
      throttleLevel = 3;
    } else if (n >= CALL_DELAY_L2_PER_MIN) {
      throttleDelayMs = 3000;
      throttleLevel = 2;
    } else if (n >= CALL_WARN_PER_MIN) {
      throttleLevel = 1;
      console.warn("[fraudGuard] elevated call velocity (warn only)", {
        userId: String(userId),
        callsLastMinute: n,
      });
    }

    if (throttleLevel >= 2) {
      console.warn("[fraudGuard] progressive call throttle", {
        userId: String(userId),
        callsLastMinute: n,
        throttleLevel,
        throttleDelayMs,
      });
      emitThrottle("fraud_throttle", {
        userId: String(userId),
        channel: "call",
        level: throttleLevel,
        delayMs: throttleDelayMs,
        callsLastMinute: n,
      });
    }

    if (throttleDelayMs > 0) {
      return {
        allowed: true,
        throttleDelayMs,
        throttleLevel,
      };
    }
  }

  if (channel === "sms") {
    window.smsTimestamps.push(now);
    const n = window.smsTimestamps.length;

    if (n >= SMS_HARD_REJECT_PER_MIN) {
      const retryAfterMs = 60_000;
      console.warn("[fraudGuard] extreme SMS velocity — request rejected (no account lock)", {
        userId: String(userId),
        smsLastMinute: n,
      });
      emitThrottle("fraud_velocity", {
        userId: String(userId),
        channel: "sms",
        level: "reject",
        smsLastMinute: n,
      });
      return {
        allowed: false,
        blocked: false,
        reason: "Too many messages in a short period. Please wait and try again.",
        statusCode: 429,
        retryAfterMs,
      };
    }

    let throttleDelayMs = 0;
    let throttleLevel = 0;
    if (n >= SMS_DELAY_L2_PER_MIN) {
      throttleDelayMs = 4000;
      throttleLevel = 2;
    } else if (n >= SMS_WARN_PER_MIN) {
      throttleLevel = 1;
      console.warn("[fraudGuard] elevated SMS velocity (warn only)", {
        userId: String(userId),
        smsLastMinute: n,
      });
    }

    if (throttleLevel >= 2) {
      emitThrottle("fraud_throttle", {
        userId: String(userId),
        channel: "sms",
        level: throttleLevel,
        delayMs: throttleDelayMs,
        smsLastMinute: n,
      });
      return {
        allowed: true,
        throttleDelayMs,
        throttleLevel,
      };
    }
  }

  const destinationCountry = detectCountryFromPhoneNumber(destinationNumber);
  const policy = await getEffectiveTelecomPolicy(userId);
  if (
    destinationCountry &&
    Array.isArray(policy?.blockedCountries) &&
    policy.blockedCountries.includes(destinationCountry)
  ) {
    console.warn("[fraudGuard] blocked destination country (single request denied)", {
      userId: String(userId),
      channel,
      destinationCountry,
    });
    emitThrottle("policy_block", {
      userId: String(userId),
      channel,
      destinationCountry,
    });
    return {
      allowed: false,
      blocked: false,
      reason: `Calls and SMS to ${destinationCountry} are blocked for your account policy.`,
      statusCode: 403,
    };
  }

  const subscription = await getLatestSubscription(userId);
  const { minutesUsed, smsUsed } = await computeUsage(userId);
  const minutesTotal = Number(subscription?.limits?.minutesTotal || 0);
  const smsTotal = Number(subscription?.limits?.smsTotal || 0);

  if (channel === "call" && minutesTotal > 0 && minutesUsed > minutesTotal * 1.5) {
    console.warn("[fraudGuard] voice usage above 150% of plan allowance — log only (no suspend)", {
      userId: String(userId),
      minutesUsed,
      minutesTotal,
    });
  }

  if (channel === "sms" && smsTotal > 0 && smsUsed > smsTotal * 1.5) {
    console.warn("[fraudGuard] SMS usage above 150% of plan allowance — log only (no suspend)", {
      userId: String(userId),
      smsUsed,
      smsTotal,
    });
  }

  return {
    allowed: true,
    destinationCountry,
  };
}
