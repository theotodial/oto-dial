import Call from "../models/Call.js";

/** Statuses that mean the user still has an in-flight call (blocks a second dial). */
export const ACTIVE_CALL_STATUSES = [
  "queued",
  "initiated",
  "dialing",
  "ringing",
  "in-progress",
  "answered",
];

const ACTIVE_CALL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Early-phase rows left behind after refresh/errors block new dials (409) — auto-fail after this. */
const STALE_EARLY_STATUS_MS = 20 * 60 * 1000;
const STALE_EARLY_STATUSES = ["initiated", "dialing", "queued"];

/**
 * Returns the user's most recent in-flight call within the age window, if any.
 * Stale early-phase calls are marked failed so users are not stuck in a 409 loop.
 */
export async function findRecentActiveCallForUser(userId) {
  const since = new Date(Date.now() - ACTIVE_CALL_MAX_AGE_MS);
  const existing = await Call.findOne({
    user: userId,
    status: { $in: ACTIVE_CALL_STATUSES },
    updatedAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .exec();

  if (!existing) return null;

  if (
    STALE_EARLY_STATUSES.includes(existing.status) &&
    Date.now() - new Date(existing.updatedAt).getTime() > STALE_EARLY_STATUS_MS
  ) {
    await Call.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: "failed",
          hangupCause: "stale_session_cleared_for_new_dial",
        },
      }
    );
    return null;
  }

  return existing;
}

/** ITU E.164: + then country (1–3 digits) + national significant number; total max 15 digits. NANP (+1) = exactly 10 digits after country code. */
export function validateE164(number) {
  const s = String(number ?? "")
    .replace(/\s/g, "")
    .trim();
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return false;
  if (s.startsWith("+1")) {
    return /^\+1\d{10}$/.test(s);
  }
  return true;
}

/**
 * For outbound dial strings: require explicit E.164 (leading +), optional 00 international prefix.
 * Does not infer country from 10-digit local input — that must be rejected.
 */
export function normalizeStrictE164ForDial(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const trimmed = String(raw).trim();
  if (trimmed.toLowerCase().startsWith("sip:")) return trimmed;
  let t = trimmed.replace(/\s/g, "");
  if (t.startsWith("00")) t = `+${t.slice(2)}`;
  if (!t.startsWith("+")) return null;
  const digits = `+${t.slice(1).replace(/\D/g, "")}`;
  return validateE164(digits) ? digits : null;
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
