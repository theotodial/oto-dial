import test from "node:test";
import assert from "node:assert/strict";

// The frontend ownership check is a pure function. We import the backend
// twin (logically identical) to exercise the rejection-decision logic
// without bringing in a browser/React runtime.
import { normalizeInboundNumberStrict } from "../src/utils/inboundOwnership.js";

/**
 * Mirror of `checkCalledNumberAgainstOwnedList` from the frontend, kept
 * close enough that both implementations evolve together. We re-implement
 * here so we can run it under `node --test` without a browser shim.
 */
function checkCalledNumberAgainstOwnedList(calledNumber, ownedNumbers) {
  if (calledNumber == null || String(calledNumber).trim() === "") {
    return { ok: false, reason: "missing_called_number", canonical: null };
  }
  const canonical = normalizeInboundNumberStrict(calledNumber);
  if (!Array.isArray(ownedNumbers) || ownedNumbers.length === 0) {
    return { ok: false, reason: "no_owned_numbers", canonical };
  }
  const ownedCanonicals = new Set();
  const ownedRaw = new Set();
  for (const entry of ownedNumbers) {
    if (!entry) continue;
    const raw = entry.phoneNumber ? String(entry.phoneNumber).trim() : "";
    if (raw) ownedRaw.add(raw);
    const c =
      entry.canonical && String(entry.canonical).trim()
        ? String(entry.canonical).trim()
        : normalizeInboundNumberStrict(raw);
    if (c) ownedCanonicals.add(c);
  }
  if (canonical && ownedCanonicals.has(canonical)) {
    return { ok: true, canonical };
  }
  const rawCalled = String(calledNumber).trim();
  if (ownedRaw.has(rawCalled)) {
    return { ok: true, canonical };
  }
  return { ok: false, reason: "not_in_owned_list", canonical };
}

test("rejects when called number belongs to a different tenant", () => {
  const verdict = checkCalledNumberAgainstOwnedList("+16465550100", [
    { phoneNumber: "+15125550111", canonical: "+15125550111" },
  ]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "not_in_owned_list");
  assert.equal(verdict.canonical, "+16465550100");
});

test("accepts when called number matches a canonical owned number", () => {
  const verdict = checkCalledNumberAgainstOwnedList("+16465550100", [
    { phoneNumber: "+16465550100", canonical: "+16465550100" },
    { phoneNumber: "+18005551234", canonical: "+18005551234" },
  ]);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.canonical, "+16465550100");
});

test("accepts when called number differs in formatting but normalizes to the same E.164", () => {
  const verdict = checkCalledNumberAgainstOwnedList("(646) 555-0100", [
    { phoneNumber: "+16465550100" },
  ]);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.canonical, "+16465550100");
});

test("rejects when ownedNumbers is empty (user has no provable numbers)", () => {
  const verdict = checkCalledNumberAgainstOwnedList("+16465550100", []);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "no_owned_numbers");
});

test("rejects when ownedNumbers is missing entirely", () => {
  assert.equal(
    checkCalledNumberAgainstOwnedList("+16465550100", null).ok,
    false
  );
  assert.equal(
    checkCalledNumberAgainstOwnedList("+16465550100", undefined).ok,
    false
  );
});

test("rejects when calledNumber is missing", () => {
  const verdict = checkCalledNumberAgainstOwnedList(null, [
    { phoneNumber: "+16465550100" },
  ]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "missing_called_number");
});

test("rejects unnormalizable destination even if owned list is non-empty", () => {
  const verdict = checkCalledNumberAgainstOwnedList("abc", [
    { phoneNumber: "+16465550100" },
  ]);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "not_in_owned_list");
});
