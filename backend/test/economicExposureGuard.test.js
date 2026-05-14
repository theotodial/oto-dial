import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { computeOutboundReservationHold } from "../src/services/economicExposureGuard.js";
import { CREDIT_RULES } from "../src/config/creditConfig.js";

test("computeOutboundReservationHold uses explicit multiplier without DB", async () => {
  const r = await computeOutboundReservationHold(new mongoose.Types.ObjectId(), 2);
  assert.equal(r.reservationMultiplier, 2);
  const expected = Math.max(
    CREDIT_RULES.callReservationMinimum,
    Math.ceil(CREDIT_RULES.callReservationMinimum * 2)
  );
  assert.equal(r.hold, expected);
});

test("computeOutboundReservationHold default multiplier is 1 when omitted", async () => {
  const r = await computeOutboundReservationHold(null, 1);
  assert.equal(r.reservationMultiplier, 1);
  assert.equal(r.hold, CREDIT_RULES.callReservationMinimum);
});
