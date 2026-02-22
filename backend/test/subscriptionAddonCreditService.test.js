import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyLoadedCreditsToSubscription,
  getActiveAddonAmounts,
  getDefaultAddonExpiry,
  parseLoadedCreditsInput
} from "../src/services/subscriptionAddonCreditService.js";

test("parseLoadedCreditsInput parses integer amounts and shared expiry", () => {
  const parsed = parseLoadedCreditsInput({
    loadedSms: "120",
    loadedMinutes: 45,
    loadedCreditsExpiry: "2099-01-01T00:00:00.000Z"
  });

  assert.equal(parsed.loadedSms, 120);
  assert.equal(parsed.loadedMinutes, 45);
  assert.ok(parsed.loadedSmsExpiry instanceof Date);
  assert.ok(parsed.loadedMinutesExpiry instanceof Date);
  assert.equal(parsed.hasChanges, true);
});

test("parseLoadedCreditsInput rejects invalid or past expiry", () => {
  assert.throws(
    () => parseLoadedCreditsInput({ loadedSms: 10, loadedCreditsExpiry: "not-a-date" }),
    /Invalid date/
  );

  assert.throws(
    () => parseLoadedCreditsInput({ loadedSms: 10, loadedCreditsExpiry: "2000-01-01T00:00:00.000Z" }),
    /future date/
  );
});

test("applyLoadedCreditsToSubscription adds credits and applies explicit expiries", () => {
  const subscription = {
    periodEnd: new Date("2099-05-01T00:00:00.000Z"),
    addons: { sms: 10, minutes: 5 },
    addonsSmsExpiry: null,
    addonsMinutesExpiry: null
  };

  const summary = applyLoadedCreditsToSubscription(subscription, {
    loadedSms: 15,
    loadedMinutes: 20,
    loadedSmsExpiry: new Date("2099-03-01T00:00:00.000Z"),
    loadedMinutesExpiry: new Date("2099-04-01T00:00:00.000Z")
  });

  assert.equal(subscription.addons.sms, 25);
  assert.equal(subscription.addons.minutes, 25);
  assert.equal(subscription.addonsSmsExpiry.toISOString(), "2099-03-01T00:00:00.000Z");
  assert.equal(subscription.addonsMinutesExpiry.toISOString(), "2099-04-01T00:00:00.000Z");
  assert.equal(summary.smsActive, 25);
  assert.equal(summary.minutesActive, 25);
});

test("applyLoadedCreditsToSubscription defaults expiry to subscription period end", () => {
  const subscription = {
    periodEnd: new Date("2099-02-15T10:00:00.000Z"),
    addons: { sms: 0, minutes: 0 },
    addonsSmsExpiry: null,
    addonsMinutesExpiry: null
  };

  applyLoadedCreditsToSubscription(subscription, {
    loadedSms: 100,
    loadedMinutes: 60
  });

  assert.equal(subscription.addonsSmsExpiry.toISOString(), "2099-02-15T10:00:00.000Z");
  assert.equal(subscription.addonsMinutesExpiry.toISOString(), "2099-02-15T10:00:00.000Z");
});

test("getActiveAddonAmounts returns 0 for expired credits", () => {
  const summary = getActiveAddonAmounts(
    {
      addons: { sms: 80, minutes: 40 },
      addonsSmsExpiry: "2000-01-01T00:00:00.000Z",
      addonsMinutesExpiry: "2000-01-01T00:00:00.000Z"
    },
    new Date("2026-01-01T00:00:00.000Z")
  );

  assert.equal(summary.smsTotal, 80);
  assert.equal(summary.minutesTotal, 40);
  assert.equal(summary.smsActive, 0);
  assert.equal(summary.minutesActive, 0);
});

test("getDefaultAddonExpiry uses period end when available", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const periodEnd = new Date("2026-01-30T00:00:00.000Z");
  const expiry = getDefaultAddonExpiry(periodEnd, now);

  assert.equal(expiry.toISOString(), "2026-01-30T00:00:00.000Z");
});
