/**
 * Country utilities for global number support
 * Provides country validation, phone number parsing, and country code mapping
 */

// Supported countries with ISO2 codes and Telnyx country codes
export const SUPPORTED_COUNTRIES = [
  // North America
  { code: "US", name: "United States", iso2: "US", telnyxCode: "US", numberProvisioningEnabled: true },
  { code: "CA", name: "Canada", iso2: "CA", telnyxCode: "CA", numberProvisioningEnabled: false },
  { code: "MX", name: "Mexico", iso2: "MX", telnyxCode: "MX", numberProvisioningEnabled: false },
  
  // Europe
  { code: "GB", name: "United Kingdom", iso2: "GB", telnyxCode: "GB", numberProvisioningEnabled: false },
  { code: "NO", name: "Norway", iso2: "NO", telnyxCode: "NO", numberProvisioningEnabled: true },
  { code: "FR", name: "France", iso2: "FR", telnyxCode: "FR", numberProvisioningEnabled: false },
  { code: "IT", name: "Italy", iso2: "IT", telnyxCode: "IT", numberProvisioningEnabled: false },
  { code: "DE", name: "Germany", iso2: "DE", telnyxCode: "DE", numberProvisioningEnabled: false },
  { code: "ES", name: "Spain", iso2: "ES", telnyxCode: "ES", numberProvisioningEnabled: false },
  { code: "CH", name: "Switzerland", iso2: "CH", telnyxCode: "CH", numberProvisioningEnabled: false },
  { code: "NL", name: "Netherlands", iso2: "NL", telnyxCode: "NL", numberProvisioningEnabled: false },
  { code: "LU", name: "Luxembourg", iso2: "LU", telnyxCode: "LU", numberProvisioningEnabled: false },
  { code: "IE", name: "Ireland", iso2: "IE", telnyxCode: "IE", numberProvisioningEnabled: false },
  { code: "TR", name: "Türkiye", iso2: "TR", telnyxCode: "TR", numberProvisioningEnabled: false },
  
  // Middle East
  { code: "AE", name: "United Arab Emirates", iso2: "AE", telnyxCode: "AE", numberProvisioningEnabled: false },
  { code: "SA", name: "Saudi Arabia", iso2: "SA", telnyxCode: "SA", numberProvisioningEnabled: false },
  { code: "QA", name: "Qatar", iso2: "QA", telnyxCode: "QA", numberProvisioningEnabled: false },
  
  // Asia
  { code: "JP", name: "Japan", iso2: "JP", telnyxCode: "JP", numberProvisioningEnabled: false },
  { code: "KR", name: "South Korea", iso2: "KR", telnyxCode: "KR", numberProvisioningEnabled: false },
  { code: "SG", name: "Singapore", iso2: "SG", telnyxCode: "SG", numberProvisioningEnabled: false },
  { code: "CN", name: "China", iso2: "CN", telnyxCode: "CN", numberProvisioningEnabled: false },
  
  // Oceania
  { code: "AU", name: "Australia", iso2: "AU", telnyxCode: "AU", numberProvisioningEnabled: false },
  { code: "NZ", name: "New Zealand", iso2: "NZ", telnyxCode: "NZ", numberProvisioningEnabled: false },
  
  // Africa
  { code: "ZA", name: "South Africa", iso2: "ZA", telnyxCode: "ZA", numberProvisioningEnabled: false }
];

// Country code to country mapping
const COUNTRY_CODE_MAP = {};
SUPPORTED_COUNTRIES.forEach(country => {
  COUNTRY_CODE_MAP[country.code] = country;
  COUNTRY_CODE_MAP[country.iso2] = country;
  COUNTRY_CODE_MAP[country.telnyxCode] = country;
});

// International dialing codes (E.164 country codes)
const DIALING_CODES = {
  "1": "US", // US/Canada (will need additional logic)
  "52": "MX", // Mexico
  "44": "GB", // UK
  "47": "NO", // Norway
  "33": "FR", // France
  "39": "IT", // Italy
  "49": "DE", // Germany
  "34": "ES", // Spain
  "41": "CH", // Switzerland
  "31": "NL", // Netherlands
  "352": "LU", // Luxembourg
  "353": "IE", // Ireland
  "90": "TR", // Türkiye
  "971": "AE", // UAE
  "966": "SA", // Saudi Arabia
  "974": "QA", // Qatar
  "81": "JP", // Japan
  "82": "KR", // South Korea
  "65": "SG", // Singapore
  "86": "CN", // China
  "61": "AU", // Australia
  "64": "NZ", // New Zealand
  "27": "ZA" // South Africa
};

/**
 * Check if a country code is supported
 */
export function isCountrySupported(countryCode) {
  return !!COUNTRY_CODE_MAP[countryCode?.toUpperCase()];
}

/**
 * Get country info by code
 */
export function getCountryByCode(countryCode) {
  return COUNTRY_CODE_MAP[countryCode?.toUpperCase()] || null;
}

/**
 * Get all supported countries
 */
export function getSupportedCountries() {
  return SUPPORTED_COUNTRIES;
}

/**
 * Check if number provisioning is currently enabled for a country.
 * This can be narrower than overall "supported countries" when
 * regulatory requirements are still being prepared.
 */
export function isNumberProvisioningEnabledCountry(countryCode) {
  const country = getCountryByCode(countryCode);
  return !!country?.numberProvisioningEnabled;
}

/**
 * Parse phone number and detect country
 * Supports E.164 format (+1234567890) and local formats
 * Returns country code or null if not detected
 */
export function detectCountryFromPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;

  // Remove all non-digit characters except +
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // If starts with +, it's E.164 format
  if (cleaned.startsWith('+')) {
    const withoutPlus = cleaned.substring(1);
    
    // Check for multi-digit country codes first (longest first)
    const sortedCodes = Object.keys(DIALING_CODES).sort((a, b) => b.length - a.length);
    
    for (const code of sortedCodes) {
      if (withoutPlus.startsWith(code)) {
        const countryCode = DIALING_CODES[code];
        // Special handling for US/Canada (both use +1)
        if (code === "1") {
          // US numbers: area codes 200-999 (excluding some special ranges)
          // Canada: area codes 204, 226, 236, 249, 250, 289, 306, 343, 365, 403, 416, 418, 431, 437, 438, 450, 506, 514, 519, 548, 579, 581, 587, 604, 613, 639, 647, 672, 705, 709, 742, 753, 778, 780, 782, 807, 819, 825, 867, 873, 902, 905, 942
          // For simplicity, we'll default to US but this could be enhanced
          // Check if it's a known Canadian area code
          const areaCode = withoutPlus.substring(1, 4);
          const canadianAreaCodes = ["204", "226", "236", "249", "250", "289", "306", "343", "365", "403", "416", "418", "431", "437", "438", "450", "506", "514", "519", "548", "579", "581", "587", "604", "613", "639", "647", "672", "705", "709", "742", "753", "778", "780", "782", "807", "819", "825", "867", "873", "902", "905", "942"];
          if (canadianAreaCodes.includes(areaCode)) {
            return "CA";
          }
          return "US";
        }
        return countryCode;
      }
    }
  }

  // If no + prefix, try to detect from length and format
  // US/Canada: 10 digits
  if (/^\d{10}$/.test(cleaned)) {
    // Default to US for 10-digit numbers without country code
    return "US";
  }

  // UK: 11 digits starting with 0, or 10 digits without leading 0
  if (/^0?\d{10}$/.test(cleaned)) {
    // Could be UK, but without country code it's ambiguous
    // We'll need context or default to US
    return null;
  }

  return null;
}

/**
 * Validate that a destination number is in the same country as the source number
 */
export function validateCountryLock(sourceCountryCode, destinationPhoneNumber) {
  if (!sourceCountryCode) {
    return { valid: false, error: "Source country code not found" };
  }

  const destCountryCode = detectCountryFromPhoneNumber(destinationPhoneNumber);
  
  if (!destCountryCode) {
    return { 
      valid: false, 
      error: "Could not detect destination country. Please use E.164 format (+country code + number)" 
    };
  }

  if (destCountryCode !== sourceCountryCode) {
    const sourceCountry = getCountryByCode(sourceCountryCode);
    const destCountry = getCountryByCode(destCountryCode);
    
    return {
      valid: false,
      error: `International calling is disabled for this number. This number (${sourceCountry?.name || sourceCountryCode}) can only call numbers within ${sourceCountry?.name || sourceCountryCode}. Destination number appears to be from ${destCountry?.name || destCountryCode}.`
    };
  }

  return { valid: true };
}

/**
 * Format phone number to E.164 format
 */
export function formatToE164(phoneNumber, countryCode = "US") {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters except +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // If already in E.164 format, return as is
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Get dialing code for country
  const country = getCountryByCode(countryCode);
  if (!country) {
    // Default to US
    const dialingCode = "1";
    return `+${dialingCode}${cleaned}`;
  }
  
  // Find dialing code
  const dialingCode = Object.keys(DIALING_CODES).find(
    code => DIALING_CODES[code] === country.code
  );
  
  if (dialingCode) {
    // Remove leading 0 if present (common in some countries)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }
    return `+${dialingCode}${cleaned}`;
  }
  
  // Fallback: assume US
  return `+1${cleaned}`;
}
