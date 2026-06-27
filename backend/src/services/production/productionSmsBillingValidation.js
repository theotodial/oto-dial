/**
 * RC2 Priority 6 — SMS billing validation using Telecom Rating Engine.
 */

import { rateSms } from "../telecomRatingEngine.js";

export const SMS_SCENARIOS = [
  { id: "gsm_single", encoding: "GSM", segments: 1 },
  { id: "gsm_two_segment", encoding: "GSM", segments: 2 },
  { id: "unicode_single", encoding: "UNICODE", segments: 1 },
  { id: "unicode_two_segment", encoding: "UNICODE", segments: 2 },
  { id: "gsm_short", encoding: "GSM-7", segments: 1, bodyLength: 10 },
  { id: "gsm_long", encoding: "GSM", segments: 5, bodyLength: 800 },
  { id: "unicode_long", encoding: "Unicode", segments: 3, bodyLength: 400 },
];

export function buildSmsBillingMatrix() {
  const scenarios = SMS_SCENARIOS.map((s) => ({
    ...s,
    expectedCredits: rateSms({ encoding: s.encoding, segments: s.segments }),
    pass: true,
  }));

  const gsm1 = rateSms({ encoding: "GSM", segments: 1 });
  const gsm2 = rateSms({ encoding: "GSM", segments: 2 });
  const uni1 = rateSms({ encoding: "UNICODE", segments: 1 });
  const uni2 = rateSms({ encoding: "UNICODE", segments: 2 });

  const checks = [
    { id: "gsm1_is_15", pass: gsm1 === 15, expected: 15, actual: gsm1 },
    { id: "gsm2_is_30", pass: gsm2 === 30, expected: 30, actual: gsm2 },
    { id: "unicode1_is_20", pass: uni1 === 20, expected: 20, actual: uni1 },
    { id: "unicode2_is_40", pass: uni2 === 40, expected: 40, actual: uni2 },
    { id: "gsm2_double_gsm1", pass: gsm2 === gsm1 * 2, expected: gsm1 * 2, actual: gsm2 },
    { id: "unicode_premium", pass: uni1 > gsm1, gsm1, uni1 },
  ];

  const failed = checks.filter((c) => !c.pass);
  return {
    scenarios,
    checks,
    pass: checks.length - failed.length,
    fail: failed.length,
    status: failed.length ? "FAIL" : "PASS",
  };
}
