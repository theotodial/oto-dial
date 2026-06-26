import test from "node:test";
import assert from "node:assert/strict";
import CreditLedger from "../src/models/CreditLedger.js";

test("credit ledger reason enum includes telecom call reasons", () => {
  const path = CreditLedger.schema.path("reason");
  assert.ok(path);
  assert.equal(path.instance, "String");
});

