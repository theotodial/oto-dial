import assert from "node:assert/strict";
import { test } from "node:test";

test("telecom backpressure score increases with webhook volume", async () => {
  const m = await import("../src/services/telecomBackpressureService.js");
  m.setBillingWorkerTickHint(0, 6000);
  m.setSchedulerQueueDepthHint(0);
  for (let i = 0; i < 400; i += 1) m.recordWebhookReceived(false);
  for (let i = 0; i < 200; i += 1) m.recordWebhookReceived(true);
  for (let i = 0; i < 900; i += 1) m.recordSocketEmit();
  for (let i = 0; i < 400; i += 1) m.recordCallTransition();
  const snap = m.getPressureSnapshot();
  assert.ok(snap.pressureScore > 20);
  assert.ok(["normal", "elevated", "high", "critical"].includes(snap.pressureLevel));
});

test("socket throttle allows terminal states", async () => {
  const { evaluateCallAuthoritativeEmit } = await import("../src/services/socketThrottleService.js");
  const r = evaluateCallAuthoritativeEmit("507f1f77bcf86cd799439011", {
    callId: "507f1f77bcf86cd799439012",
    callStateVersion: 1,
    callStatus: "completed",
    snapshot: { direction: "outbound" },
  });
  assert.equal(r.allow, true);
});

test("priority scheduler drops LOW under critical", async () => {
  const bp = await import("../src/services/telecomBackpressureService.js");
  for (let i = 0; i < 400; i += 1) bp.recordWebhookReceived(false);
  for (let i = 0; i < 200; i += 1) bp.recordWebhookReceived(true);
  for (let i = 0; i < 1200; i += 1) bp.recordSocketEmit();
  for (let i = 0; i < 500; i += 1) bp.recordCallTransition();
  const sched = await import("../src/services/telecomPriorityScheduler.js");
  const out = await sched.scheduleTelecomTask("LOW", async () => "should-not-run");
  assert.equal(out.ok, false);
  assert.equal(out.dropped, true);
});

test("hot user isolation signals rank in getHotUserIds", async () => {
  const hot = await import("../src/services/hotUserIsolationService.js");
  hot.recordUserTelecomSignal("507f1f77bcf86cd799439011", { webhookHits: 5, duplicates: 2 });
  const ids = hot.getHotUserIds(5);
  assert.ok(ids.length >= 1);
  assert.equal(ids[0].userId, "507f1f77bcf86cd799439011");
});

test("webhook burst stats returns keys structure", async () => {
  const b = await import("../src/services/webhookBurstProtectionService.js");
  for (let i = 0; i < 50; i += 1) {
    b.recordWebhookBurstSample({
      provider: "telnyx:voice",
      userId: "u1",
      callKey: "cc1",
      duplicate: false,
    });
  }
  const s = b.getWebhookBurstStats();
  assert.ok(Array.isArray(s.topKeys));
});
