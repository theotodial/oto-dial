import assert from "node:assert/strict";
import { mock, test } from "node:test";
import Subscription from "../src/models/Subscription.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  getServerDayBounds,
  getUnlimitedMonthlyWindow,
  incrementUnlimitedUsageAfterSuccess,
} from "../src/services/unlimitedUsageService.js";

function mockFindByIdLean(result) {
  return mock.method(Subscription, "findById", () => ({
    lean: async () => result,
  }));
}

test("checkUnlimitedUsageBeforeAction passes through for non-unlimited subscriptions", async (t) => {
  const subscriptionId = "sub-regular";
  const findByIdMock = mockFindByIdLean({
    _id: subscriptionId,
    displayUnlimited: false,
    planType: "starter",
  });

  t.after(() => {
    findByIdMock.mock.restore();
  });

  const result = await checkUnlimitedUsageBeforeAction({
    subscriptionId,
    userId: "user-1",
    channel: "sms",
    smsIncrement: 1,
  });

  assert.equal(result.allowed, true);
});

test("incrementUnlimitedUsageAfterSuccess is a no-op (usage not stored on Subscription)", async (t) => {
  const updateOneMock = mock.method(Subscription, "updateOne", async () => ({
    modifiedCount: 1,
  }));

  t.after(() => {
    updateOneMock.mock.restore();
  });

  const result = await incrementUnlimitedUsageAfterSuccess({
    subscriptionId: "sub-x",
    userId: "user-3",
    channel: "voice",
    smsIncrement: 2,
    minutesIncrementSeconds: 120,
  });

  assert.deepEqual(result, { success: true, skipped: true });
  assert.equal(updateOneMock.mock.calls.length, 0);
});

test("createSuspiciousActivityErrorPayload returns required API shape", () => {
  assert.deepEqual(createSuspiciousActivityErrorPayload(), {
    success: false,
    error: "Suspicious activity detected. Please contact support.",
  });
});

test("getServerDayBounds covers local calendar day", () => {
  const d = new Date(2026, 3, 13, 15, 30, 0);
  const { start, end } = getServerDayBounds(d);
  assert.equal(start.getHours(), 0);
  assert.equal(end.getHours(), 23);
});

test("getUnlimitedMonthlyWindow uses subscription period when now is inside", () => {
  const start = new Date("2026-04-01T00:00:00Z");
  const end = new Date("2026-04-30T23:59:59Z");
  const now = new Date("2026-04-15T12:00:00Z");
  const w = getUnlimitedMonthlyWindow({ periodStart: start, periodEnd: end }, now);
  assert.equal(w.start.getTime(), start.getTime());
  assert.equal(w.end.getTime(), end.getTime());
});
