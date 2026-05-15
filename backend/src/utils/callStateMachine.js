/**
 * Single source of truth for allowed Call.status transitions (MongoDB).
 * Terminal states are immutable and every caller must converge into this machine.
 */

export const CALL_STATES = {
  QUEUED: "queued",
  INITIATED: "initiated",
  DIALING: "dialing",
  RINGING: "ringing",
  ANSWERED: "answered",
  ACTIVE: "in-progress",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELED: "canceled",
  BUSY: "busy",
  NO_ANSWER: "no-answer",
  REJECTED: "rejected",
};

export const TERMINAL_STATUSES = [
  CALL_STATES.COMPLETED,
  CALL_STATES.FAILED,
  CALL_STATES.CANCELED,
  CALL_STATES.BUSY,
  CALL_STATES.NO_ANSWER,
  CALL_STATES.REJECTED,
];

/** Legacy / inbound answer path — treated as active for guards */
export const ACTIVE_LIKE_STATUSES = [CALL_STATES.ACTIVE, CALL_STATES.ANSWERED];

export const ACTIVE_CALL_STATUSES = [
  CALL_STATES.QUEUED,
  CALL_STATES.INITIATED,
  CALL_STATES.DIALING,
  CALL_STATES.RINGING,
  CALL_STATES.ANSWERED,
  CALL_STATES.ACTIVE,
];

const ALLOWED = {
  [CALL_STATES.QUEUED]: [
    CALL_STATES.INITIATED,
    CALL_STATES.DIALING,
    CALL_STATES.RINGING,
    CALL_STATES.CANCELED,
  ],
  [CALL_STATES.INITIATED]: [
    CALL_STATES.DIALING,
    CALL_STATES.RINGING,
    CALL_STATES.CANCELED,
    CALL_STATES.FAILED,
  ],
  [CALL_STATES.DIALING]: [
    CALL_STATES.RINGING,
    CALL_STATES.ANSWERED,
    CALL_STATES.ACTIVE,
    CALL_STATES.CANCELED,
    CALL_STATES.BUSY,
    CALL_STATES.NO_ANSWER,
    CALL_STATES.REJECTED,
    CALL_STATES.FAILED,
  ],
  [CALL_STATES.RINGING]: [
    CALL_STATES.ANSWERED,
    CALL_STATES.ACTIVE,
    CALL_STATES.CANCELED,
    CALL_STATES.BUSY,
    CALL_STATES.NO_ANSWER,
    CALL_STATES.REJECTED,
    CALL_STATES.FAILED,
  ],
  [CALL_STATES.ANSWERED]: [
    CALL_STATES.ACTIVE,
    CALL_STATES.COMPLETED,
    CALL_STATES.CANCELED,
    CALL_STATES.FAILED,
  ],
  [CALL_STATES.ACTIVE]: [
    CALL_STATES.COMPLETED,
    CALL_STATES.CANCELED,
    CALL_STATES.FAILED,
  ],
  [CALL_STATES.COMPLETED]: [],
  [CALL_STATES.FAILED]: [],
  [CALL_STATES.CANCELED]: [],
  [CALL_STATES.BUSY]: [],
  [CALL_STATES.NO_ANSWER]: [],
  [CALL_STATES.REJECTED]: [],
};

export function normalizeCallStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return null;
  // Backward compatibility for historical records/UI.
  if (normalized === "missed") return CALL_STATES.NO_ANSWER;
  return normalized;
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(normalizeCallStatus(status));
}

export function isActiveCallStatus(status) {
  return ACTIVE_CALL_STATUSES.includes(normalizeCallStatus(status));
}

export function canTransitionTo(fromStatus, toStatus) {
  const from = normalizeCallStatus(fromStatus);
  const to = normalizeCallStatus(toStatus);
  if (!to || from === to) return false;
  if (!from) return true;
  if (isTerminalStatus(from)) return false;
  const next = ALLOWED[from];
  return Array.isArray(next) && next.includes(to);
}

export function mapHangupToTerminalStatus({
  hangupCause,
  hangupCauseCode,
  callAnsweredAt,
  callStartedAt: _legacyCallStartedAtIgnored = null,
} = {}) {
  /** Only a persisted answer timestamp counts — callStartedAt alone caused false "completed". */
  const answered = Boolean(callAnsweredAt);
  const cause = String(hangupCause || "")
    .trim()
    .toUpperCase();
  const code = Number(hangupCauseCode);

  if (answered) {
    if (cause === "ORIGINATOR_CANCEL" || cause === "ORIGINATOR_CANCELLED") {
      return CALL_STATES.CANCELED;
    }
    return CALL_STATES.COMPLETED;
  }

  if (cause === "USER_BUSY" || cause === "BUSY" || code === 486 || code === 600 || code === 17) {
    return CALL_STATES.BUSY;
  }
  if (
    cause === "NO_ANSWER" ||
    cause === "NO_USER_RESPONSE" ||
    cause === "SUBSCRIBER_ABSENT" ||
    cause === "ALLOTTED_TIMEOUT" ||
    code === 487 ||
    code === 408 ||
    code === 19
  ) {
    return CALL_STATES.NO_ANSWER;
  }
  if (cause === "CALL_REJECTED" || cause === "DECLINE" || code === 603 || code === 21) {
    return CALL_STATES.REJECTED;
  }
  if (cause === "ORIGINATOR_CANCEL" || cause === "ORIGINATOR_CANCELLED") {
    return CALL_STATES.CANCELED;
  }
  return CALL_STATES.FAILED;
}
