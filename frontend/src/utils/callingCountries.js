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

const DIAL_CODE_TO_COUNTRY = Object.values(COUNTRY_DIAL_DATA).reduce((acc, entry) => {
  acc[entry.dialCode] = entry.code;
  return acc;
}, {});

function normalizeDigits(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

/**
 * Client-side guard — backend enforces the same rules on POST /api/calls and /api/sms/send.
 */
export function validateOutboundDestination(destinationNumber, allowedCallCountries) {
  const allowed = normalizeCountryCodes(allowedCallCountries);
  const effective = allowed.length > 0 ? allowed : DEFAULT_ALLOWED_CALL_COUNTRIES;
  const cleaned = normalizeDigits(destinationNumber);

  if (!cleaned) {
    return { ok: false, error: "Enter a destination number." };
  }

  if (cleaned.startsWith("+1") || /^\d{10}$/.test(cleaned.replace(/^\+/, ""))) {
    if (!effective.includes("US") && !effective.includes("CA")) {
      return {
        ok: false,
        error: "Calls and SMS are limited to USA and Canada on your account.",
      };
    }
    return { ok: true, destinationCountry: effective.includes("US") ? "US" : "CA" };
  }

  if (cleaned.startsWith("+")) {
    const dialCodes = Object.keys(DIAL_CODE_TO_COUNTRY).sort((a, b) => b.length - a.length);
    for (const dialCode of dialCodes) {
      if (cleaned.startsWith(dialCode)) {
        const country = DIAL_CODE_TO_COUNTRY[dialCode];
        if (!effective.includes(country)) {
          return {
            ok: false,
            error: "Calls and SMS are limited to USA and Canada unless your admin enables more countries.",
          };
        }
        return { ok: true, destinationCountry: country };
      }
    }
    return {
      ok: false,
      error: "International numbers are not enabled on your account. USA and Canada only.",
    };
  }

  return { ok: false, error: "Use a valid number with country code (e.g. +16465550100)." };
}
