export function normalizeSmsDestination(rawTo) {
  const value = String(rawTo || "").trim();
  if (!value) return null;

  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return null;

  // SMS short codes (e.g. US 5–6 digit): must be digits only, never +E.164.
  // User-entered "+74843" is not valid international format; carriers expect "74843".
  if (/^\d{3,8}$/.test(digitsOnly)) {
    return digitsOnly;
  }

  if (value.startsWith("+")) {
    return `+${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}

export function isLikelyShortCode(value) {
  return /^\d{3,8}$/.test(String(value || "").replace(/\D/g, ""));
}
