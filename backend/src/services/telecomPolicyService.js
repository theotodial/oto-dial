import { detectCountryFromPhoneNumber, resolveTelnyxDestinationCountry } from "../utils/countryUtils.js";
import { getActiveCustomPackage, isCountryAllowedByPolicy } from "./customPackageService.js";
import User from "../models/User.js";

const DEFAULT_ALLOWED_CALL_COUNTRIES = (
  process.env.TELECOM_DEFAULT_ALLOWED_CALL_COUNTRIES ||
  "US,CA,VE,MX,CO,PE,BR,AR,CL,GB,DE,FR,ES,IT,PH"
)
  .split(/[,;\s]+/)
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

function normalizeCountryList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

async function getUserCallCountryPolicy(userId) {
  const user = await User.findById(userId).select("allowedCallCountries").lean();
  const configuredAllowedCountries = normalizeCountryList(user?.allowedCallCountries);
  return {
    configuredAllowedCountries,
    effectiveAllowedCountries:
      configuredAllowedCountries.length > 0
        ? configuredAllowedCountries
        : DEFAULT_ALLOWED_CALL_COUNTRIES,
  };
}

export async function getEffectiveTelecomPolicy(userId) {
  const customPackage = await getActiveCustomPackage(userId);
  if (!customPackage) {
    return null;
  }

  return {
    isCallEnabled: Boolean(customPackage.isCallEnabled),
    isSmsEnabled: Boolean(customPackage.isSmsEnabled),
    allowedCountries: Array.isArray(customPackage.allowedCountries)
      ? customPackage.allowedCountries
      : [],
    blockedCountries: Array.isArray(customPackage.blockedCountries)
      ? customPackage.blockedCountries
      : [],
    customPackage,
  };
}

export async function enforceTelecomPolicy({ userId, channel, destinationNumber }) {
  const userCallCountryPolicy = await getUserCallCountryPolicy(userId);
  const policy = await getEffectiveTelecomPolicy(userId);
  const destinationCountry = resolveTelnyxDestinationCountry(destinationNumber);

  if (
    channel === "call" &&
    destinationCountry &&
    !userCallCountryPolicy.effectiveAllowedCountries.includes(destinationCountry)
  ) {
    return {
      allowed: false,
      error: `Calling to ${destinationCountry} is disabled for this user. Allowed countries: ${userCallCountryPolicy.effectiveAllowedCountries.join(", ")}.`,
      destinationCountry,
      userCallCountryPolicy,
      policy,
    };
  }

  if (!policy) {
    return { allowed: true, destinationCountry, userCallCountryPolicy, policy: null };
  }

  if (channel === "call" && !policy.isCallEnabled) {
    return {
      allowed: false,
      error: "Calling is disabled for this user by admin policy.",
      policy,
    };
  }

  if (channel === "sms" && !policy.isSmsEnabled) {
    return {
      allowed: false,
      error: "SMS is disabled for this user by admin policy.",
      policy,
    };
  }

  const countryCheck = isCountryAllowedByPolicy(destinationCountry, policy);
  if (!countryCheck.allowed) {
    return {
      allowed: false,
      error: countryCheck.error,
      destinationCountry,
      userCallCountryPolicy,
      policy,
    };
  }

  return {
    allowed: true,
    destinationCountry,
    userCallCountryPolicy,
    policy,
  };
}
