import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeIdempotencyKey,
  validateApplyBillingEventInput,
} from "../src/services/billingEnforcementGateway.js";

const OID = "507f1f77bcf86cd799439011";

test("normalizeIdempotencyKey truncates to 200 chars", () => {
  const long = "x".repeat(250);
  assert.equal(normalizeIdempotencyKey(long).length, 200);
  assert.equal(normalizeIdempotencyKey("  abc  "), "  abc  ");
});

test("validateApplyBillingEventInput accepts minimal valid payload", () => {
  const r = validateApplyBillingEventInput({
    userId: OID,
    idempotencyKey: "k:1",
    amount: 0,
    type: "reservation_hold",
    sourceService: "test",
  });
  assert.equal(r.ok, true);
  assert.equal(r.amountNum, 0);
  assert.equal(r.keyStr, "k:1");
  assert.equal(String(r.uid), OID);
});

test("validateApplyBillingEventInput rejects missing userId", () => {
  const r = validateApplyBillingEventInput({
    idempotencyKey: "k",
    amount: 0,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "userId_required");
});

test("validateApplyBillingEventInput rejects missing idempotencyKey", () => {
  const r = validateApplyBillingEventInput({
    userId: OID,
    amount: 0,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "idempotency_key_required");
});

test("validateApplyBillingEventInput rejects non-finite amount", () => {
  assert.equal(
    validateApplyBillingEventInput({ userId: OID, idempotencyKey: "k", amount: NaN }).error,
    "amount_must_be_number"
  );
  assert.equal(
    validateApplyBillingEventInput({ userId: OID, idempotencyKey: "k", amount: "x" }).error,
    "amount_must_be_number"
  );
});

test("validateApplyBillingEventInput rejects invalid user id", () => {
  const r = validateApplyBillingEventInput({
    userId: "not-an-objectid",
    idempotencyKey: "k",
    amount: 0,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "invalid_user_id");
});
