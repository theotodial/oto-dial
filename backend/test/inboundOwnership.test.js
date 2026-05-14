import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInboundNumberStrict } from "../src/utils/inboundOwnership.js";

test("normalizeInboundNumberStrict: passes through E.164 unchanged", () => {
  assert.equal(normalizeInboundNumberStrict("+16465550100"), "+16465550100");
  assert.equal(normalizeInboundNumberStrict("+447911123456"), "+447911123456");
});

test("normalizeInboundNumberStrict: promotes 10-digit NANP to +1...", () => {
  assert.equal(normalizeInboundNumberStrict("6465550100"), "+16465550100");
  assert.equal(normalizeInboundNumberStrict("16465550100"), "+16465550100");
});

test("normalizeInboundNumberStrict: strips whitespace + standardizes 00 prefix", () => {
  assert.equal(normalizeInboundNumberStrict(" +1 646-555-0100 "), "+16465550100");
  assert.equal(normalizeInboundNumberStrict("0044 7911 123456"), "+447911123456");
});

test("normalizeInboundNumberStrict: rejects unsalvageable input", () => {
  assert.equal(normalizeInboundNumberStrict(""), null);
  assert.equal(normalizeInboundNumberStrict("   "), null);
  assert.equal(normalizeInboundNumberStrict("abc"), null);
  assert.equal(normalizeInboundNumberStrict("1234567"), null); // too short
  assert.equal(normalizeInboundNumberStrict(null), null);
  assert.equal(normalizeInboundNumberStrict(undefined), null);
});

test("normalizeInboundNumberStrict: rejects +1 with wrong digit count", () => {
  // NANP MUST be exactly 10 NSN digits after +1 (total length 12).
  assert.equal(normalizeInboundNumberStrict("+1646555010"), null);
  assert.equal(normalizeInboundNumberStrict("+164655501000"), null);
});

test("normalizeInboundNumberStrict: collides only canonical forms", () => {
  // Two different writings of the same logical number should normalize identically.
  const a = normalizeInboundNumberStrict("(646) 555-0100");
  const b = normalizeInboundNumberStrict("+1-646-555-0100");
  const c = normalizeInboundNumberStrict("16465550100");
  assert.equal(a, "+16465550100");
  assert.equal(b, "+16465550100");
  assert.equal(c, "+16465550100");
});

test("normalizeInboundNumberStrict: keeps SIP URIs untouched", () => {
  assert.equal(
    normalizeInboundNumberStrict("sip:1234@example.com"),
    "sip:1234@example.com"
  );
  assert.equal(
    normalizeInboundNumberStrict("  sip:abc@example.com  "),
    "sip:abc@example.com"
  );
});
