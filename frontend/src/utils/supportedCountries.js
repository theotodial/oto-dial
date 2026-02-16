/**
 * Supported countries for global number support
 * Must match backend/src/utils/countryUtils.js
 */

export const SUPPORTED_COUNTRIES = [
  // North America
  { code: "US", name: "United States", iso2: "US", flag: "🇺🇸", numberProvisioningEnabled: true },
  { code: "CA", name: "Canada", iso2: "CA", flag: "🇨🇦", numberProvisioningEnabled: false },
  { code: "MX", name: "Mexico", iso2: "MX", flag: "🇲🇽", numberProvisioningEnabled: false },
  
  // Europe
  { code: "GB", name: "United Kingdom", iso2: "GB", flag: "🇬🇧", numberProvisioningEnabled: false },
  { code: "NO", name: "Norway", iso2: "NO", flag: "🇳🇴", numberProvisioningEnabled: true },
  { code: "FR", name: "France", iso2: "FR", flag: "🇫🇷", numberProvisioningEnabled: false },
  { code: "IT", name: "Italy", iso2: "IT", flag: "🇮🇹", numberProvisioningEnabled: false },
  { code: "DE", name: "Germany", iso2: "DE", flag: "🇩🇪", numberProvisioningEnabled: false },
  { code: "ES", name: "Spain", iso2: "ES", flag: "🇪🇸", numberProvisioningEnabled: false },
  { code: "CH", name: "Switzerland", iso2: "CH", flag: "🇨🇭", numberProvisioningEnabled: false },
  { code: "NL", name: "Netherlands", iso2: "NL", flag: "🇳🇱", numberProvisioningEnabled: false },
  { code: "LU", name: "Luxembourg", iso2: "LU", flag: "🇱🇺", numberProvisioningEnabled: false },
  { code: "IE", name: "Ireland", iso2: "IE", flag: "🇮🇪", numberProvisioningEnabled: false },
  { code: "TR", name: "Türkiye", iso2: "TR", flag: "🇹🇷", numberProvisioningEnabled: false },
  
  // Middle East
  { code: "AE", name: "United Arab Emirates", iso2: "AE", flag: "🇦🇪", numberProvisioningEnabled: false },
  { code: "SA", name: "Saudi Arabia", iso2: "SA", flag: "🇸🇦", numberProvisioningEnabled: false },
  { code: "QA", name: "Qatar", iso2: "QA", flag: "🇶🇦", numberProvisioningEnabled: false },
  
  // Asia
  { code: "JP", name: "Japan", iso2: "JP", flag: "🇯🇵", numberProvisioningEnabled: false },
  { code: "KR", name: "South Korea", iso2: "KR", flag: "🇰🇷", numberProvisioningEnabled: false },
  { code: "SG", name: "Singapore", iso2: "SG", flag: "🇸🇬", numberProvisioningEnabled: false },
  { code: "CN", name: "China", iso2: "CN", flag: "🇨🇳", numberProvisioningEnabled: false },
  
  // Oceania
  { code: "AU", name: "Australia", iso2: "AU", flag: "🇦🇺", numberProvisioningEnabled: false },
  { code: "NZ", name: "New Zealand", iso2: "NZ", flag: "🇳🇿", numberProvisioningEnabled: false },
  
  // Africa
  { code: "ZA", name: "South Africa", iso2: "ZA", flag: "🇿🇦", numberProvisioningEnabled: false }
];

export function getCountryByCode(code) {
  return SUPPORTED_COUNTRIES.find(c => c.code === code || c.iso2 === code);
}

export function getDefaultCountry() {
  return SUPPORTED_COUNTRIES.find(c => c.code === "US") || SUPPORTED_COUNTRIES[0];
}
