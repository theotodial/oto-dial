import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldBlockAutomaticCleanup,
  shouldBlockHangup,
} from './callLifecycleGuards.js';

function refs(overrides = {}) {
  return {
    outboundDialActiveRef: { current: overrides.outbound ?? false },
    outboundDialStartedAtRef: { current: overrides.startedAt ?? Date.now() },
    callStateRef: { current: overrides.callState ?? 'idle' },
    telnyxClientRef: { current: overrides.client ?? null },
    manualHangupRef: { current: false },
    userEndedFullCallRef: { current: false },
  };
}

const neverTerminal = () => false;

describe('callLifecycleGuards', () => {
  it('blocks automatic cleanup during outbound ringing with live legs', () => {
    const r = refs({
      outbound: true,
      callState: 'ringing',
      client: { calls: { a: { id: 'a', state: 'ringing' } } },
    });
    assert.equal(
      shouldBlockAutomaticCleanup('sdk_leg_terminal', r, neverTerminal),
      true
    );
  });

  it('allows user hangup during setup', () => {
    const r = refs({ outbound: true, callState: 'ringing' });
    assert.equal(shouldBlockAutomaticCleanup('user_hangup', r, neverTerminal), false);
  });

  it('blocks hangup on persist failure', () => {
    assert.equal(shouldBlockHangup('persist_after_newCall_failed'), true);
  });
});
