function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeThreadPhone(raw) {
  const digits = digitsOnly(raw);
  if (!digits) return "";
  return `+${digits}`;
}

export function buildSmsThreadKey({ userId, ownedNumber, externalNumber }) {
  const owner = String(userId || "").trim();
  const owned = normalizeThreadPhone(ownedNumber);
  const external = normalizeThreadPhone(externalNumber);
  if (!owner || !owned || !external) return "";
  return `${owner}:${owned}:${external}`;
}

export function isCompositeThreadKey(value) {
  return String(value || "").split(":").length === 3;
}

export function parseSmsThreadKey(value) {
  const raw = String(value || "").trim();
  if (!isCompositeThreadKey(raw)) return null;
  const [userId, ownedNumber, externalNumber] = raw.split(":");
  if (!userId || !ownedNumber || !externalNumber) return null;
  return {
    userId,
    ownedNumber: normalizeThreadPhone(ownedNumber),
    externalNumber: normalizeThreadPhone(externalNumber),
  };
}
