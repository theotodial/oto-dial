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

export function applyCustomPackageToSubscription(subscription, customPackage) {
  if (!customPackage) {
    return subscription;
  }

  const usage = subscription?.usage || {};
  const minutesUsed = Number(usage.minutesUsed || 0) / 60;
  const smsUsed = Number(usage.smsUsed || 0);
  const minutesAllowed = Math.max(0, Number(customPackage.minutesAllowed || 0));
  const smsAllowed = Math.max(0, Number(customPackage.smsAllowed || 0));
  const callEnabled = Boolean(customPackage.isCallEnabled);
  const smsEnabled = Boolean(customPackage.isSmsEnabled);

  return {
    ...(subscription || {}),
    active:
      callEnabled ||
      smsEnabled ||
      minutesAllowed > 0 ||
      smsAllowed > 0 ||
      Boolean(subscription?.active),
    status: customPackage.active ? "custom_override" : (subscription?.status || "inactive"),
    planType: "custom",
    planName: customPackage.overridePlan ? "Custom Package" : (subscription?.planName || "Custom Package"),
    plan: customPackage.overridePlan ? "Custom Package" : (subscription?.plan || subscription?.planName || "Custom Package"),
    minutesRemaining: Math.max(0, minutesAllowed - minutesUsed),
    smsRemaining: Math.max(0, smsAllowed - smsUsed),
    limits: {
      minutesTotal: minutesAllowed,
      smsTotal: smsAllowed,
      numbersTotal: Number(subscription?.limits?.numbersTotal || 1),
    },
    isCallEnabled: callEnabled,
    isSmsEnabled: smsEnabled,
    allowedCountries: normalizeCountryList(customPackage.allowedCountries),
    blockedCountries: normalizeCountryList(customPackage.blockedCountries),
    customPackage: {
      ...customPackage,
      allowedCountries: normalizeCountryList(customPackage.allowedCountries),
      blockedCountries: normalizeCountryList(customPackage.blockedCountries),
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
    isCallEnabled: Boolean(input.isCallEnabled),
    isSmsEnabled: Boolean(input.isSmsEnabled),
    allowedCountries: normalizeCountryList(input.allowedCountries),
    blockedCountries: normalizeCountryList(input.blockedCountries),
    overridePlan: input.overridePlan !== false,
    active: input.active !== false,
    notes: String(input.notes || "").trim(),
  };
}
