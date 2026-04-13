export function normalizeSmsDestination(rawTo) {
  const value = String(rawTo || "").trim();
  if (!value) return null;

  if (value.startsWith("+")) {
    return value;
  }

  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return null;

  if (/^\d{3,8}$/.test(digitsOnly)) {
    return digitsOnly;
  }

  return `+${digitsOnly}`;
}

export function isLikelyShortCode(value) {
  return /^\d{3,8}$/.test(String(value || "").replace(/\D/g, ""));
}
