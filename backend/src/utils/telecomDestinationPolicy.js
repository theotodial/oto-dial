import { resolveTelnyxDestinationCountry } from "./countryUtils.js";

export const DEFAULT_TELECOM_ALLOWED_COUNTRIES = ["US", "CA"];

const INTERNATIONAL_RESTRICTED_MESSAGE =
  "Calls and SMS are limited to USA and Canada numbers. Contact support if you need another country enabled on your account.";

function normalizeCountryList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function normalizeE164Digits(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

export function getEffectiveAllowedCountries(configuredAllowedCountries = []) {
  const configured = normalizeCountryList(configuredAllowedCountries);
  return configured.length > 0 ? configured : [...DEFAULT_TELECOM_ALLOWED_COUNTRIES];
}

/**
 * Returns ISO2 destination country or null when unknown.
 */
export function resolveDestinationCountry(destinationNumber) {
  return resolveTelnyxDestinationCountry(destinationNumber);
}

/**
 * True when destination is allowed for this user's country list (default US + CA only).
 */
export function isDestinationAllowedForCountries(destinationNumber, configuredAllowedCountries = []) {
  const allowed = getEffectiveAllowedCountries(configuredAllowedCountries);
  const cleaned = normalizeE164Digits(destinationNumber);

  if (!cleaned) {
    return { allowed: false, error: "Destination number is required.", destinationCountry: null };
  }

  const destinationCountry = resolveDestinationCountry(destinationNumber);

  if (destinationCountry) {
    if (!allowed.includes(destinationCountry)) {
      return {
        allowed: false,
        error: INTERNATIONAL_RESTRICTED_MESSAGE,
        destinationCountry,
        allowedCountries: allowed,
      };
    }
    return { allowed: true, destinationCountry, allowedCountries: allowed };
  }

  // NANP: +1 or 10-digit local
  if (cleaned.startsWith("+1") || /^\d{10}$/.test(cleaned.replace(/^\+/, ""))) {
    const nanpAllowed = allowed.includes("US") || allowed.includes("CA");
    if (!nanpAllowed) {
      return {
        allowed: false,
        error: INTERNATIONAL_RESTRICTED_MESSAGE,
        destinationCountry: "US",
        allowedCountries: allowed,
      };
    }
    return { allowed: true, destinationCountry: "US", allowedCountries: allowed };
  }

  // Any other +E.164 prefix is international and blocked by default.
  if (cleaned.startsWith("+")) {
    return {
      allowed: false,
      error: INTERNATIONAL_RESTRICTED_MESSAGE,
      destinationCountry: null,
      allowedCountries: allowed,
    };
  }

  return {
    allowed: false,
    error: "Use a valid E.164 number (e.g. +16465550100).",
    destinationCountry: null,
    allowedCountries: allowed,
  };
}

export default {
  DEFAULT_TELECOM_ALLOWED_COUNTRIES,
  getEffectiveAllowedCountries,
  resolveDestinationCountry,
  isDestinationAllowedForCountries,
};
