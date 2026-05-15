import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOutboundSession,
  extractTelnyxIds,
  reconcileMongoCallId,
  registerRtcLeg,
  resolveActiveCall,
  resetRegistryForTests,
  syncCallFromLeg,
} from './rtcCallRegistry.js';

function mockCall(overrides = {}) {
  return {
    id: 'rtc-leg-1',
    state: 'ringing',
    direction: 'outbound',
    telnyxIDs: {
      telnyxCallControlId: 'v3:ctrl-1',
      telnyxSessionId: 'sess-1',
      telnyxLegId: 'leg-1',
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetRegistryForTests();
});

describe('rtcCallRegistry', () => {
  it('resolves by rtcCallId then session then mongo', () => {
    const session = createOutboundSession({ traceId: 't1' });
    const call = mockCall();
    registerRtcLeg(session.localCallId, call);
    reconcileMongoCallId(session.localCallId, 'mongo-abc');

    assert.equal(resolveActiveCall({ rtcCallId: 'rtc-leg-1' }).entry?.mongoCallId, 'mongo-abc');
    assert.equal(resolveActiveCall({ telnyxSessionId: 'sess-1' }).matchKey, 'telnyxSessionId');
    assert.equal(resolveActiveCall({ mongoCallId: 'mongo-abc' }).matchKey, 'mongoCallId');
  });

  it('syncCallFromLeg attaches mongo id to call object', () => {
    const session = createOutboundSession({});
    const call = mockCall({ id: 'rtc-leg-2' });
    registerRtcLeg(session.localCallId, call);
    reconcileMongoCallId(session.localCallId, 'mongo-xyz');

    const sibling = mockCall({ id: 'rtc-leg-3' });
    syncCallFromLeg(sibling);
    assert.equal(sibling._dbCallId, 'mongo-xyz');
    assert.equal(sibling._localCallId, session.localCallId);
  });

  it('extractTelnyxIds reads telnyxIDs getter shape', () => {
    const ids = extractTelnyxIds(mockCall());
    assert.equal(ids.rtcCallId, 'rtc-leg-1');
    assert.equal(ids.telnyxCallControlId, 'v3:ctrl-1');
    assert.equal(ids.telnyxSessionId, 'sess-1');
    assert.equal(ids.telnyxLegId, 'leg-1');
  });
});
