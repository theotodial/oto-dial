const DEFAULT_ALLOWED_CALL_COUNTRIES = ["US", "CA"];

const COUNTRY_DIAL_DATA = {
  US: { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  CA: { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  MX: { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  GB: { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  NO: { code: "NO", name: "Norway", dialCode: "+47", flag: "🇳🇴" },
  FR: { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  IT: { code: "IT", name: "Italy", dialCode: "+39", flag: "🇮🇹" },
  DE: { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  ES: { code: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
  CH: { code: "CH", name: "Switzerland", dialCode: "+41", flag: "🇨🇭" },
  NL: { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  LU: { code: "LU", name: "Luxembourg", dialCode: "+352", flag: "🇱🇺" },
  IE: { code: "IE", name: "Ireland", dialCode: "+353", flag: "🇮🇪" },
  TR: { code: "TR", name: "Turkiye", dialCode: "+90", flag: "🇹🇷" },
  AE: { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  SA: { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  QA: { code: "QA", name: "Qatar", dialCode: "+974", flag: "🇶🇦" },
  JP: { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
  KR: { code: "KR", name: "South Korea", dialCode: "+82", flag: "🇰🇷" },
  PK: { code: "PK", name: "Pakistan", dialCode: "+92", flag: "🇵🇰" },
  IN: { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  SG: { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  CN: { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳" },
  AU: { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  NZ: { code: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" },
  ZA: { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  ZW: { code: "ZW", name: "Zimbabwe", dialCode: "+263", flag: "🇿🇼" },
};

function normalizeCountryCodes(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export function getDialCountriesForUser(allowedCallCountries) {
  const normalized = normalizeCountryCodes(allowedCallCountries);
  const allowed = normalized.length > 0 ? normalized : DEFAULT_ALLOWED_CALL_COUNTRIES;
  const entries = allowed
    .map((countryCode) => COUNTRY_DIAL_DATA[countryCode])
    .filter(Boolean);

  const hasUS = entries.some((entry) => entry.code === "US");
  const hasCA = entries.some((entry) => entry.code === "CA");
  const mergedNorthAmerica = [];

  if (hasUS || hasCA) {
    const name = hasUS && hasCA ? "USA / Canada" : hasUS ? "United States" : "Canada";
    const flag = hasUS && hasCA ? "🇺🇸🇨🇦" : hasUS ? "🇺🇸" : "🇨🇦";
    mergedNorthAmerica.push({
      code: "+1",
      name,
      flag,
      countryCodes: hasUS && hasCA ? ["US", "CA"] : hasUS ? ["US"] : ["CA"],
    });
  }

  const nonNorthAmerica = entries
    .filter((entry) => !["US", "CA"].includes(entry.code))
    .map((entry) => ({
      code: entry.dialCode,
      name: entry.name,
      flag: entry.flag,
      countryCodes: [entry.code],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const result = [...mergedNorthAmerica, ...nonNorthAmerica];
  if (result.length > 0) return result;
  return [{ code: "+1", name: "USA / Canada", flag: "🇺🇸🇨🇦", countryCodes: ["US", "CA"] }];
}

