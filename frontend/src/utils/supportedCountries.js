/**
 * Supported countries for global number support
 * Must match backend/src/utils/countryUtils.js
 */

export const SUPPORTED_COUNTRIES = [
  // North America
  { code: "US", name: "United States", iso2: "US", flag: "🇺🇸" },
  { code: "CA", name: "Canada", iso2: "CA", flag: "🇨🇦" },
  { code: "MX", name: "Mexico", iso2: "MX", flag: "🇲🇽" },
  
  // Europe
  { code: "GB", name: "United Kingdom", iso2: "GB", flag: "🇬🇧" },
  { code: "NO", name: "Norway", iso2: "NO", flag: "🇳🇴" },
  { code: "FR", name: "France", iso2: "FR", flag: "🇫🇷" },
  { code: "IT", name: "Italy", iso2: "IT", flag: "🇮🇹" },
  { code: "DE", name: "Germany", iso2: "DE", flag: "🇩🇪" },
  { code: "ES", name: "Spain", iso2: "ES", flag: "🇪🇸" },
  { code: "CH", name: "Switzerland", iso2: "CH", flag: "🇨🇭" },
  { code: "NL", name: "Netherlands", iso2: "NL", flag: "🇳🇱" },
  { code: "LU", name: "Luxembourg", iso2: "LU", flag: "🇱🇺" },
  { code: "IE", name: "Ireland", iso2: "IE", flag: "🇮🇪" },
  { code: "TR", name: "Türkiye", iso2: "TR", flag: "🇹🇷" },
  
  // Middle East
  { code: "AE", name: "United Arab Emirates", iso2: "AE", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", iso2: "SA", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", iso2: "QA", flag: "🇶🇦" },
  
  // Asia
  { code: "JP", name: "Japan", iso2: "JP", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", iso2: "KR", flag: "🇰🇷" },
  { code: "SG", name: "Singapore", iso2: "SG", flag: "🇸🇬" },
  { code: "CN", name: "China", iso2: "CN", flag: "🇨🇳" },
  
  // Oceania
  { code: "AU", name: "Australia", iso2: "AU", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", iso2: "NZ", flag: "🇳🇿" },
  
  // Africa
  { code: "ZA", name: "South Africa", iso2: "ZA", flag: "🇿🇦" }
];

export function getCountryByCode(code) {
  return SUPPORTED_COUNTRIES.find(c => c.code === code || c.iso2 === code);
}

export function getDefaultCountry() {
  return SUPPORTED_COUNTRIES.find(c => c.code === "US") || SUPPORTED_COUNTRIES[0];
}
