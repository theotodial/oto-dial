import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPayload, extractWebhookEnvelope } from "../src/agents/shared/webhookPayloadHash.js";
import { DEPLOYMENT_SAFETY_CHECK_NAMES } from "../src/agents/deployment/deploymentSafetyChecks.js";

test("webhook payload hashing is stable across object key order", () => {
  const a = { id: "evt_1", nested: { b: 2, a: 1 } };
  const b = { nested: { a: 1, b: 2 }, id: "evt_1" };
  assert.equal(hashPayload(a), hashPayload(b));
});

test("webhook envelope extracts Telnyx event identity", () => {
  const envelope = extractWebhookEnvelope({
    data: {
      id: "evt_voice_1",
      event_type: "call.answered",
      payload: { call_control_id: "abc" },
    },
  });
  assert.equal(envelope.eventId, "evt_voice_1");
  assert.equal(envelope.eventType, "call.answered");
  assert.equal(envelope.payload.call_control_id, "abc");
});

test("deployment safety validation tracks all required smoke checks", () => {
  assert.deepEqual(DEPLOYMENT_SAFETY_CHECK_NAMES, [
    "outboundSms",
    "inboundSms",
    "webhookReplay",
    "outboundCall",
    "callAnswer",
    "queueEnqueueDequeue",
    "websocketLiveSync",
    "tenantIsolation",
    "billingIntegrity",
  ]);
});
