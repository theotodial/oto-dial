import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateSmsParts,
  detectEncoding,
  sanitizeMessage,
} from "../src/services/smsBillingService.js";

test("ASCII short message is GSM single part", () => {
  assert.equal(detectEncoding("Hello"), "GSM");
  assert.equal(calculateSmsParts("Hello"), 1);
});

test("Unicode emoji forces UCS-2 segmentation", () => {
  assert.equal(detectEncoding("Hi 😀"), "UNICODE");
  assert.equal(calculateSmsParts("😀"), 1);
});

test("sanitizeMessage strips bidi / variation selectors", () => {
  const s = sanitizeMessage("A\u200EB\uFE0F");
  assert.equal(s.includes("\u200e"), false);
  assert.equal(s.includes("\ufe0f"), false);
});

test("GSM multi-part uses 153 chars per segment after first", () => {
  const oneSixty = "a".repeat(160);
  assert.equal(calculateSmsParts(oneSixty), 1);
  assert.equal(calculateSmsParts("a".repeat(161)), 2);
});

test("Unicode multi-part uses 67 chars per segment after first", () => {
  const hiragana = "あ";
  assert.equal(detectEncoding(hiragana.repeat(10)), "UNICODE");
  assert.equal(calculateSmsParts(hiragana.repeat(70)), 1);
  assert.equal(calculateSmsParts(hiragana.repeat(71)), 2);
});
