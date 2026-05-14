import assert from "node:assert/strict";
import { test } from "node:test";
import { auditMonotonicNumericField } from "../src/services/eventOrderValidationService.js";

test("auditMonotonicNumericField detects regression", () => {
  const v = auditMonotonicNumericField([1, 2, 2, 1]);
  assert.ok(v.length >= 1);
});

test("auditMonotonicNumericField accepts monotonic", () => {
  const v = auditMonotonicNumericField([1, 2, 3, 4]);
  assert.equal(v.length, 0);
});
