import { getActiveCustomPackage, isCountryAllowedByPolicy } from "./customPackageService.js";
import User from "../models/User.js";
import {
  getEffectiveAllowedCountries,
  isDestinationAllowedForCountries,
  resolveDestinationCountry,
} from "../utils/telecomDestinationPolicy.js";

async function getUserCallCountryPolicy(userId) {
  const user = await User.findById(userId).select("allowedCallCountries").lean();
  const configuredAllowedCountries = Array.isArray(user?.allowedCallCountries)
    ? user.allowedCallCountries
    : [];
  return {
    configuredAllowedCountries,
    effectiveAllowedCountries: getEffectiveAllowedCountries(configuredAllowedCountries),
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
  const destinationCountry = resolveDestinationCountry(destinationNumber);

  if (channel === "call" || channel === "sms") {
    const countryGate = isDestinationAllowedForCountries(
      destinationNumber,
      userCallCountryPolicy.configuredAllowedCountries
    );
    if (!countryGate.allowed) {
      return {
        allowed: false,
        error: countryGate.error,
        destinationCountry: countryGate.destinationCountry || destinationCountry,
        userCallCountryPolicy,
        policy,
        countryRestricted: true,
      };
    }
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
