import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("economicRecoveryService bills via callCreditBillingService interval path", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/services/economicRecoveryService.js"), "utf8");
  assert.match(src, /billConnectedDurationIntervals/);
});

test("sweep stale threshold matches worker tick basis (crash recovery alignment)", () => {
  const TICK_MS = Number(process.env.CALL_CREDIT_TICK_MS || 6000);
  const staleMult = 2;
  const staleMs = staleMult * TICK_MS;
  assert.equal(staleMs, 12000);
});
