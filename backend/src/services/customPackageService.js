import CustomPackage from "../models/CustomPackage.js";

function normalizeCountryList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export async function getActiveCustomPackage(userId) {
  if (!userId) return null;

  return CustomPackage.findOne({
    userId,
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
}

export function isCustomPackageActive(customPackage, now = new Date()) {
  if (!customPackage || customPackage.active !== true) {
    return false;
  }

  if (!customPackage.expiresAt) {
    return true;
  }

  const expiresAt = new Date(customPackage.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
}

export function applyCustomPackageToSubscription(subscription, customPackage) {
  if (!isCustomPackageActive(customPackage)) {
    return subscription;
  }

  const minutesAllowed = Math.max(0, Number(customPackage.minutesAllowed ?? 0));
  const smsAllowed = Math.max(0, Number(customPackage.smsAllowed ?? 0));
  const callEnabled = customPackage.isCallEnabled !== false;
  const smsEnabled = customPackage.isSmsEnabled !== false;
  const smsUsed = Math.max(0, Number(subscription?.usage?.smsUsed ?? 0));
  const minutesUsedSeconds = Math.max(
    0,
    Number(subscription?.usage?.minutesUsed ?? 0)
  );
  const minutesUsed = minutesUsedSeconds / 60;
  const normalizedAllowedCountries = normalizeCountryList(customPackage.allowedCountries);
  const normalizedBlockedCountries = normalizeCountryList(customPackage.blockedCountries);

  return {
    ...(subscription || {}),
    active: true,
    status: "custom_override",
    planType: "custom",
    planName: customPackage.overridePlan ? "Custom Package" : (subscription?.planName || "Custom Package"),
    minutesRemaining: Math.max(minutesAllowed - minutesUsed, 0),
    smsRemaining: Math.max(smsAllowed - smsUsed, 0),
    minutesLimit: minutesAllowed,
    smsLimit: smsAllowed,
    minutesUsed,
    smsUsed,
    limits: {
      minutesTotal: minutesAllowed,
      smsTotal: smsAllowed,
      numbersTotal: Number(subscription?.limits?.numbersTotal ?? 1),
    },
    usage: {
      ...(subscription?.usage || {}),
      minutesUsed: minutesUsedSeconds,
      smsUsed,
    },
    isCallEnabled: callEnabled,
    isSmsEnabled: smsEnabled,
    source: "customPackage",
    allowedCountries: normalizedAllowedCountries,
    blockedCountries: normalizedBlockedCountries,
    customPackage: {
      ...customPackage,
      allowedCountries: normalizedAllowedCountries,
      blockedCountries: normalizedBlockedCountries,
    },
  };
}

export function isCountryAllowedByPolicy(destinationCountry, policy = {}) {
  const code = String(destinationCountry || "").trim().toUpperCase();
  if (!code) {
    return { allowed: true };
  }

  const allowedCountries = normalizeCountryList(policy.allowedCountries);
  const blockedCountries = normalizeCountryList(policy.blockedCountries);

  if (allowedCountries.length > 0 && !allowedCountries.includes(code)) {
    return {
      allowed: false,
      error: `Destination country ${code} is not allowed for this user.`,
    };
  }

  if (blockedCountries.includes(code)) {
    return {
      allowed: false,
      error: `Destination country ${code} is blocked for this user.`,
    };
  }

  return { allowed: true };
}

export function sanitizeCustomPackageInput(input = {}) {
  const numericField = (value, fieldName) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${fieldName} must be a non-negative number`);
    }
    return Math.round(parsed);
  };

  const expiresAt =
    input.expiresAt === null || input.expiresAt === ""
      ? null
      : input.expiresAt
        ? new Date(input.expiresAt)
        : null;

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new Error("expiresAt is invalid");
  }

  return {
    minutesAllowed: numericField(input.minutesAllowed, "minutesAllowed"),
    smsAllowed: numericField(input.smsAllowed, "smsAllowed"),
    expiresAt,
    isCallEnabled: input.isCallEnabled !== false,
    isSmsEnabled: input.isSmsEnabled !== false,
    allowedCountries: normalizeCountryList(input.allowedCountries),
    blockedCountries: normalizeCountryList(input.blockedCountries),
    overridePlan: input.overridePlan !== false,
    active: input.active !== false,
    notes: String(input.notes || "").trim(),
  };
}
