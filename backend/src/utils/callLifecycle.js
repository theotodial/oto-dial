import Call from "../models/Call.js";

/** Statuses that mean the user still has an in-flight call (blocks a second dial). */
export const ACTIVE_CALL_STATUSES = [
  "queued",
  "dialing",
  "ringing",
  "in-progress",
  "answered",
];

const ACTIVE_CALL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/**
 * Returns the user's most recent in-flight call within the age window, if any.
 */
export async function findRecentActiveCallForUser(userId) {
  const since = new Date(Date.now() - ACTIVE_CALL_MAX_AGE_MS);
  return Call.findOne({
    user: userId,
    status: { $in: ACTIVE_CALL_STATUSES },
    updatedAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .exec();
}

/** Loose E.164-ish normalization for matching webhook numbers to DB rows */
export function normalizeCallPartyNumber(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim().replace(/\s/g, "");
  if (s.toLowerCase().startsWith("sip:")) return s;
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  if (s.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
