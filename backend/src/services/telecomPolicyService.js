import { detectCountryFromPhoneNumber } from "../utils/countryUtils.js";
import { getActiveCustomPackage, isCountryAllowedByPolicy } from "./customPackageService.js";

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
  const policy = await getEffectiveTelecomPolicy(userId);
  if (!policy) {
    return { allowed: true, policy: null };
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

  const destinationCountry = detectCountryFromPhoneNumber(destinationNumber);
  const countryCheck = isCountryAllowedByPolicy(destinationCountry, policy);
  if (!countryCheck.allowed) {
    return {
      allowed: false,
      error: countryCheck.error,
      destinationCountry,
      policy,
    };
  }

  return {
    allowed: true,
    destinationCountry,
    policy,
  };
}
