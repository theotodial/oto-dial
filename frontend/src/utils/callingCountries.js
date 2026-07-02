const DEFAULT_ALLOWED_CALL_COUNTRIES = ["US", "CA"];

const COUNTRY_DIAL_DATA = {
  US: { code: "US", name: "United States", dialCode: "+1" },
  CA: { code: "CA", name: "Canada", dialCode: "+1" },
  MX: { code: "MX", name: "Mexico", dialCode: "+52" },
  GB: { code: "GB", name: "United Kingdom", dialCode: "+44" },
  NO: { code: "NO", name: "Norway", dialCode: "+47" },
  FR: { code: "FR", name: "France", dialCode: "+33" },
  IT: { code: "IT", name: "Italy", dialCode: "+39" },
  DE: { code: "DE", name: "Germany", dialCode: "+49" },
  ES: { code: "ES", name: "Spain", dialCode: "+34" },
  CH: { code: "CH", name: "Switzerland", dialCode: "+41" },
  NL: { code: "NL", name: "Netherlands", dialCode: "+31" },
  LU: { code: "LU", name: "Luxembourg", dialCode: "+352" },
  IE: { code: "IE", name: "Ireland", dialCode: "+353" },
  TR: { code: "TR", name: "Turkiye", dialCode: "+90" },
  AE: { code: "AE", name: "United Arab Emirates", dialCode: "+971" },
  SA: { code: "SA", name: "Saudi Arabia", dialCode: "+966" },
  QA: { code: "QA", name: "Qatar", dialCode: "+974" },
  JP: { code: "JP", name: "Japan", dialCode: "+81" },
  KR: { code: "KR", name: "South Korea", dialCode: "+82" },
  PK: { code: "PK", name: "Pakistan", dialCode: "+92" },
  IN: { code: "IN", name: "India", dialCode: "+91" },
  SG: { code: "SG", name: "Singapore", dialCode: "+65" },
  CN: { code: "CN", name: "China", dialCode: "+86" },
  AU: { code: "AU", name: "Australia", dialCode: "+61" },
  NZ: { code: "NZ", name: "New Zealand", dialCode: "+64" },
  ZA: { code: "ZA", name: "South Africa", dialCode: "+27" },
  ZW: { code: "ZW", name: "Zimbabwe", dialCode: "+263" },
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
    const flagCodes = hasUS && hasCA ? ["US", "CA"] : hasUS ? ["US"] : ["CA"];
    mergedNorthAmerica.push({
      code: "+1",
      name,
      flagCodes,
      countryCodes: flagCodes,
    });
  }

  const nonNorthAmerica = entries
    .filter((entry) => !["US", "CA"].includes(entry.code))
    .map((entry) => ({
      code: entry.dialCode,
      name: entry.name,
      flagCodes: [entry.code],
      countryCodes: [entry.code],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const result = [...mergedNorthAmerica, ...nonNorthAmerica];
  if (result.length > 0) return result;
  return [{ code: "+1", name: "USA / Canada", flagCodes: ["US", "CA"], countryCodes: ["US", "CA"] }];
}
