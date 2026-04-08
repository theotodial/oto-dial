/**
 * Single source of truth for allowed Call.status transitions (MongoDB).
 * No reverting, no skipping forward (e.g. initiated → in-progress).
 */

export const CALL_STATES = {
  INITIATED: "initiated",
  DIALING: "dialing",
  RINGING: "ringing",
  ACTIVE: "in-progress",
  COMPLETED: "completed",
  FAILED: "failed",
  MISSED: "missed",
};

export const TERMINAL_STATUSES = ["completed", "failed", "missed"];

/** Legacy / inbound answer path — treated as active for guards */
export const ACTIVE_LIKE_STATUSES = ["in-progress", "answered"];

/** Intermediate transitions only; terminal statuses are set by call.hangup (or timeout / start failure). */
const ALLOWED = {
  queued: ["initiated", "dialing", "ringing"],
  initiated: ["dialing", "failed"],
  dialing: ["ringing", "in-progress", "failed"],
  ringing: ["in-progress", "failed"],
  "in-progress": [],
  answered: ["in-progress"],
  completed: [],
  failed: [],
  missed: [],
};

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransitionTo(fromStatus, toStatus) {
  if (!toStatus || fromStatus === toStatus) return false;
  if (isTerminalStatus(fromStatus)) return false;
  const next = ALLOWED[fromStatus];
  return Array.isArray(next) && next.includes(toStatus);
}
