import test from "node:test";
import assert from "node:assert/strict";
import {
  CALL_STATES,
  canTransitionTo,
  isTerminalStatus,
  mapHangupToTerminalStatus,
  normalizeCallStatus,
} from "../src/utils/callStateMachine.js";

test("normalizes legacy missed to no-answer", () => {
  assert.equal(normalizeCallStatus("missed"), CALL_STATES.NO_ANSWER);
  assert.equal(normalizeCallStatus("  MISSED "), CALL_STATES.NO_ANSWER);
});

test("allows valid non-terminal progression", () => {
  assert.equal(canTransitionTo(CALL_STATES.INITIATED, CALL_STATES.DIALING), true);
  assert.equal(canTransitionTo(CALL_STATES.DIALING, CALL_STATES.RINGING), true);
  assert.equal(canTransitionTo(CALL_STATES.RINGING, CALL_STATES.EARLY_MEDIA), true);
  assert.equal(canTransitionTo(CALL_STATES.EARLY_MEDIA, CALL_STATES.ANSWERED), true);
  assert.equal(canTransitionTo(CALL_STATES.RINGING, CALL_STATES.ANSWERED), true);
  assert.equal(canTransitionTo(CALL_STATES.ANSWERED, CALL_STATES.ACTIVE), true);
  assert.equal(canTransitionTo(CALL_STATES.ACTIVE, CALL_STATES.COMPLETED), true);
});

test("rejects impossible transitions and terminal mutations", () => {
  assert.equal(canTransitionTo(CALL_STATES.COMPLETED, CALL_STATES.RINGING), false);
  assert.equal(canTransitionTo(CALL_STATES.FAILED, CALL_STATES.ANSWERED), false);
  assert.equal(canTransitionTo(CALL_STATES.RINGING, CALL_STATES.QUEUED), false);
  assert.equal(isTerminalStatus(CALL_STATES.BUSY), true);
  assert.equal(isTerminalStatus(CALL_STATES.REJECTED), true);
});

test("maps pre-answer hangups into deterministic terminal statuses", () => {
  assert.equal(
    mapHangupToTerminalStatus({ hangupCause: "USER_BUSY", callStartedAt: null }),
    CALL_STATES.BUSY
  );
  assert.equal(
    mapHangupToTerminalStatus({ hangupCause: "NO_ANSWER", callStartedAt: null }),
    CALL_STATES.NO_ANSWER
  );
  assert.equal(
    mapHangupToTerminalStatus({ hangupCauseCode: 603, callStartedAt: null }),
    CALL_STATES.REJECTED
  );
});

test("maps answered hangups to completed unless explicitly canceled", () => {
  const answeredAt = new Date();
  assert.equal(
    mapHangupToTerminalStatus({ hangupCause: "NORMAL_CLEARING", callAnsweredAt: answeredAt }),
    CALL_STATES.COMPLETED
  );
  assert.equal(
    mapHangupToTerminalStatus({ hangupCause: "ORIGINATOR_CANCEL", callAnsweredAt: answeredAt }),
    CALL_STATES.CANCELED
  );
});
