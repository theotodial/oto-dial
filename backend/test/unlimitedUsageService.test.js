import assert from "node:assert/strict";
import { mock, test } from "node:test";
import Subscription from "../src/models/Subscription.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  getServerDayKey,
  incrementUnlimitedUsageAfterSuccess
} from "../src/services/unlimitedUsageService.js";

function mockFindByIdLean(result) {
  return mock.method(Subscription, "findById", () => ({
    lean: async () => result
  }));
}

test("checkUnlimitedUsageBeforeAction allows normal usage and applies daily reset guard", async (t) => {
  const subscriptionId = "sub-allow-1";
  const dayKey = getServerDayKey();
  const updateOneMock = mock.method(Subscription, "updateOne", async () => ({ modifiedCount: 1 }));
  const findByIdMock = mockFindByIdLean({
    _id: subscriptionId,
    displayUnlimited: true,
    usage: { smsUsed: 100, minutesUsed: 600 },
    dailySmsUsed: 10,
    dailyMinutesUsed: 120,
    monthlySmsLimit: 400,
    monthlyMinutesLimit: 3600,
    dailySmsLimit: 30,
    dailyMinutesLimit: 180
  });

  t.after(() => {
    updateOneMock.mock.restore();
    findByIdMock.mock.restore();
  });

  const result = await checkUnlimitedUsageBeforeAction({
    subscriptionId,
    userId: "user-1",
    channel: "sms",
    smsIncrement: 1,
    minutesIncrementSeconds: 60
  });

  assert.equal(result.allowed, true);
  assert.equal(updateOneMock.mock.calls.length, 1);

  const [resetQuery, resetUpdate] = updateOneMock.mock.calls[0].arguments;
  assert.deepEqual(resetQuery, {
    _id: subscriptionId,
    usageWindowDateKey: { $ne: dayKey }
  });
  assert.equal(resetUpdate.$set.usageWindowDateKey, dayKey);
  assert.equal(resetUpdate.$set.dailySmsUsed, 0);
  assert.equal(resetUpdate.$set.dailyMinutesUsed, 0);
  assert.ok(resetUpdate.$set.lastUsageReset instanceof Date);
});

test("checkUnlimitedUsageBeforeAction blocks request when monthly limit would be exceeded", async (t) => {
  const subscriptionId = "sub-block-1";
  const updateOneMock = mock.method(Subscription, "updateOne", async () => ({ modifiedCount: 1 }));
  const findByIdMock = mockFindByIdLean({
    _id: subscriptionId,
    displayUnlimited: true,
    usage: { smsUsed: 400, minutesUsed: 0 },
    dailySmsUsed: 0,
    dailyMinutesUsed: 0,
    monthlySmsLimit: 400,
    monthlyMinutesLimit: 3600,
    dailySmsLimit: 30,
    dailyMinutesLimit: 180
  });
  const warnMock = mock.method(console, "warn", () => {});

  t.after(() => {
    updateOneMock.mock.restore();
    findByIdMock.mock.restore();
    warnMock.mock.restore();
  });

  const result = await checkUnlimitedUsageBeforeAction({
    subscriptionId,
    userId: "user-2",
    channel: "sms",
    smsIncrement: 1
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "limit_exceeded");
  assert.ok(warnMock.mock.calls.length >= 1);
  assert.equal(warnMock.mock.calls[0].arguments[0], "[limit_exceeded]");
  assert.match(String(warnMock.mock.calls[0].arguments[1]), /"reason":"pre_action_guard"/);
});

test("incrementUnlimitedUsageAfterSuccess increments monthly and daily usage atomically", async (t) => {
  const subscriptionId = "sub-inc-1";
  let updateCount = 0;
  const updateOneMock = mock.method(Subscription, "updateOne", async () => {
    updateCount += 1;
    return { modifiedCount: 1 };
  });
  const findByIdMock = mockFindByIdLean({
    _id: subscriptionId,
    displayUnlimited: true,
    usage: { smsUsed: 50, minutesUsed: 600 },
    dailySmsUsed: 5,
    dailyMinutesUsed: 120,
    monthlySmsLimit: 400,
    monthlyMinutesLimit: 3600,
    dailySmsLimit: 30,
    dailyMinutesLimit: 180
  });

  t.after(() => {
    updateOneMock.mock.restore();
    findByIdMock.mock.restore();
  });

  const result = await incrementUnlimitedUsageAfterSuccess({
    subscriptionId,
    userId: "user-3",
    channel: "voice",
    smsIncrement: 2,
    minutesIncrementSeconds: 120
  });

  assert.deepEqual(result, { success: true });
  assert.equal(updateCount, 2);

  const [incrementQuery, incrementUpdate] = updateOneMock.mock.calls[1].arguments;
  assert.equal(incrementQuery._id, subscriptionId);
  assert.equal(incrementQuery.status, "active");
  assert.equal(typeof incrementQuery["usage.smsUsed"].$lte, "number");
  assert.equal(typeof incrementQuery["usage.minutesUsed"].$lte, "number");
  assert.deepEqual(incrementUpdate, {
    $inc: {
      "usage.smsUsed": 2,
      dailySmsUsed: 2,
      "usage.minutesUsed": 120,
      dailyMinutesUsed: 120
    }
  });
});

test("incrementUnlimitedUsageAfterSuccess caps counters when race pushes usage past limits", async (t) => {
  const subscriptionId = "sub-inc-cap-1";
  let callNumber = 0;
  const updateOneMock = mock.method(Subscription, "updateOne", async () => {
    callNumber += 1;
    if (callNumber === 1) {
      return { modifiedCount: 1 };
    }
    if (callNumber === 2) {
      return { modifiedCount: 0 };
    }
    return { modifiedCount: 1 };
  });
  const findByIdMock = mockFindByIdLean({
    _id: subscriptionId,
    displayUnlimited: true,
    usage: { smsUsed: 4, minutesUsed: 0 },
    dailySmsUsed: 2,
    dailyMinutesUsed: 0,
    monthlySmsLimit: 5,
    monthlyMinutesLimit: 10,
    dailySmsLimit: 3,
    dailyMinutesLimit: 5
  });
  const warnMock = mock.method(console, "warn", () => {});

  t.after(() => {
    updateOneMock.mock.restore();
    findByIdMock.mock.restore();
    warnMock.mock.restore();
  });

  const result = await incrementUnlimitedUsageAfterSuccess({
    subscriptionId,
    userId: "user-4",
    channel: "sms",
    smsIncrement: 2,
    minutesIncrementSeconds: 120
  });

  assert.deepEqual(result, { success: false, limitReached: true });
  assert.equal(callNumber, 3);

  const [capQuery, capUpdate] = updateOneMock.mock.calls[2].arguments;
  assert.deepEqual(capQuery, { _id: subscriptionId });
  assert.deepEqual(capUpdate, {
    $max: {
      "usage.smsUsed": 5,
      dailySmsUsed: 3,
      "usage.minutesUsed": 600,
      dailyMinutesUsed: 300
    }
  });
  assert.equal(warnMock.mock.calls.length, 1);
  assert.match(String(warnMock.mock.calls[0].arguments[1]), /"reason":"post_success_increment_blocked"/);
});

test("createSuspiciousActivityErrorPayload returns required API shape", () => {
  assert.deepEqual(createSuspiciousActivityErrorPayload(), {
    success: false,
    error: "Suspicious activity detected. Please contact support."
  });
});
