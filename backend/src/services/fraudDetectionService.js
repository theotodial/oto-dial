import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import CustomPackage from "../models/CustomPackage.js";
import { detectCountryFromPhoneNumber } from "../utils/countryUtils.js";
import { getEffectiveTelecomPolicy } from "./telecomPolicyService.js";

const fraudWindows = globalThis.__otoDialFraudWindows || new Map();

if (!globalThis.__otoDialFraudWindows) {
  globalThis.__otoDialFraudWindows = fraudWindows;
}

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

async function flagUser(userId, reason, extra = {}) {
  if (!userId) return { blocked: false, reason };

  const now = new Date();
  await Promise.all([
    User.updateOne(
      { _id: userId },
      {
        $set: {
          status: "suspended",
          lastFraudFlagAt: now,
          lastFraudReason: reason,
        },
      }
    ),
    CustomPackage.updateMany(
      { userId, active: true },
      {
        $set: {
          isCallEnabled: false,
          notes: `[AUTO-FRAUD ${now.toISOString()}] ${reason}`,
        },
      }
    ),
    Subscription.updateMany(
      {
        userId,
        status: { $in: ["active", "trialing", "pending_activation", "past_due", "incomplete"] },
      },
      {
        $set: {
          status: "suspended",
        },
      }
    ),
  ]);

  return {
    blocked: true,
    reason,
    ...extra,
  };
}

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
    if (window.callTimestamps.length > 20) {
      return flagUser(userId, "Too many calls in a 60 second window", {
        metric: "callsLastMinute",
        value: window.callTimestamps.length,
      });
    }
  }

  if (channel === "sms") {
    window.smsTimestamps.push(now);
  }

  const destinationCountry = detectCountryFromPhoneNumber(destinationNumber);
  const policy = await getEffectiveTelecomPolicy(userId);
  if (
    destinationCountry &&
    Array.isArray(policy?.blockedCountries) &&
    policy.blockedCountries.includes(destinationCountry)
  ) {
    return flagUser(userId, `Attempted ${channel} to blocked country ${destinationCountry}`, {
      metric: "blockedCountry",
      value: destinationCountry,
    });
  }

  const subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing", "pending_activation", "past_due", "incomplete"] },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("usage limits")
    .lean();

  const minutesTotal = Number(subscription?.limits?.minutesTotal || 0);
  const minutesUsed = Number(subscription?.usage?.minutesUsed || 0) / 60;
  const smsTotal = Number(subscription?.limits?.smsTotal || 0);
  const smsUsed = Number(subscription?.usage?.smsUsed || 0);

  if (channel === "call" && minutesTotal > 0 && minutesUsed > minutesTotal * 1.5) {
    return flagUser(userId, "Voice usage spike exceeds 150% of limit", {
      metric: "minutesUsed",
      value: minutesUsed,
    });
  }

  if (channel === "sms" && smsTotal > 0 && smsUsed > smsTotal * 1.5) {
    return flagUser(userId, "SMS usage spike exceeds 150% of limit", {
      metric: "smsUsed",
      value: smsUsed,
    });
  }

  return {
    allowed: true,
    destinationCountry,
  };
}
