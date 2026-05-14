import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileUserReservations } from "../src/services/reservationReconciliationService.js";

test("reconcileUserReservations rejects invalid user id (read-only, no DB)", async () => {
  const r = await reconcileUserReservations("not-a-valid-object-id");
  assert.equal(r.error, "invalid_user_id");
  assert.equal(r.healthy, false);
});
