import test from "node:test";
import assert from "node:assert/strict";
import {
  formatLedgerLabel,
  formatCredits,
  deriveBillingStatus,
  enrichLedgerRow,
} from "../src/services/creditLedgerFormatService.js";
import { replayJournalEventsSorted } from "../src/services/ledgerReconstructionService.js";

test("formatLedgerLabel maps call events", () => {
  assert.equal(
    formatLedgerLabel({ type: "call_event_charge", metadata: { eventName: "ringing" } }),
    "Ringing"
  );
  assert.equal(
    formatLedgerLabel({ type: "subscription_credit_grant", metadata: { planName: "Basic" } }),
    "Monthly Grant (Basic)"
  );
});

test("formatCredits shows signed amounts", () => {
  assert.equal(formatCredits(1500), "+1500");
  assert.equal(formatCredits(-4), "-4");
  assert.equal(formatCredits(-1.5), "-1.5");
});

test("deriveBillingStatus classifies rows", () => {
  assert.equal(deriveBillingStatus({ type: "sms_charge", amount: -15 }), "charged");
  assert.equal(deriveBillingStatus({ type: "subscription_credit_grant", amount: 1500 }), "credited");
  assert.equal(deriveBillingStatus({ type: "reservation_hold", amount: 0 }), "reserved");
});

test("enrichLedgerRow produces explorer shape", () => {
  const row = enrichLedgerRow(
    {
      _id: "abc",
      user: "user1",
      type: "call_event_charge",
      amount: -4,
      balanceBefore: 100,
      balanceAfter: 96,
      reason: "call_event_ringing",
      metadata: { eventName: "ringing" },
      callId: "call1",
      createdAt: new Date("2026-01-01"),
      idempotencyKey: "k1",
    },
    { callMap: { call1: { telnyxCallControlId: "telnyx-123" } } }
  );
  assert.equal(row.label, "Ringing");
  assert.equal(row.creditsDisplay, "-4");
  assert.equal(row.remainingBalance, 96);
  assert.equal(row.telnyxCallId, "telnyx-123");
  assert.equal(row.billingStatus, "charged");
});

test("replayJournalEventsSorted balances grants and charges", () => {
  const result = replayJournalEventsSorted([
    { eventType: "grant", amount: 1500, metadata: {} },
    { eventType: "attempt_charge", amount: -4, metadata: {} },
    { eventType: "sms_charge", amount: -15, metadata: {} },
  ]);
  assert.equal(result.balance, 1481);
  assert.equal(result.totalConsumed, 19);
  assert.equal(result.eventCount, 3);
});
