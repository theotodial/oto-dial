/**
 * Sliding-window burst detection for webhook storms (provider/user/call).
 * Suppression flags apply ONLY to duplicate telemetry, noisy debug logs, and
 * optional parity-style refreshes — never billing, transitions, dedup, or sequence.
 */

import { getPressureSnapshot } from "./telecomBackpressureService.js";
import { isSafeDeploymentMode } from "./deploymentModeService.js";

const WINDOW_MS = 60_000;
const MAX_KEYS = 4000;

/** @type {Map<string, number[]>} */
const windows = new Map();

function trim(tsList, now) {
  while (tsList.length && now - tsList[0] > WINDOW_MS) tsList.shift();
}

function keyPart(v) {
  if (v == null || v === "") return "_";
  return String(v).slice(0, 200);
}

function touchKey(mapKey) {
  if (windows.size > MAX_KEYS && !windows.has(mapKey)) {
    const first = windows.keys().next().value;
    if (first) windows.delete(first);
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.provider]
 * @param {string|null} [opts.userId]
 * @param {string|null} [opts.callKey]
 * @param {boolean} [opts.duplicate]
 */
export function recordWebhookBurstSample(opts = {}) {
  const now = Date.now();
  const provider = keyPart(opts.provider || "unknown");
  const userId = keyPart(opts.userId);
  const callKey = keyPart(opts.callKey);

  const pk = `p:${provider}`;
  const uk = `u:${userId}`;
  const ck = `c:${callKey}`;

  for (const k of [pk, uk, ck]) {
    touchKey(k);
    if (!windows.has(k)) windows.set(k, []);
    const arr = windows.get(k);
    arr.push(now);
    trim(arr, now);
  }
}

export function getWebhookBurstStats() {
  const snap = [];
  for (const [k, ts] of windows) {
    const now = Date.now();
    trim(ts, now);
    if (ts.length) snap.push({ key: k, count60s: ts.length });
  }
  snap.sort((a, b) => b.count60s - a.count60s);
  const top = snap.slice(0, 24);
  const providerBursts = top.filter((x) => x.key.startsWith("p:") && x.count60s > 180).length;
  const userBursts = top.filter((x) => x.key.startsWith("u:") && x.key !== "u:_" && x.count60s > 120).length;
  const callBursts = top.filter((x) => x.key.startsWith("c:") && x.key !== "c:_" && x.count60s > 40).length;
  return {
    providerBursts,
    userBursts,
    callBursts,
    topKeys: top,
  };
}

function burstSeverity() {
  const snap = getPressureSnapshot();
  if (snap.pressureLevel === "critical") return 3;
  if (snap.pressureLevel === "high") return 2;
  if (snap.pressureLevel === "elevated") return 1;
  return 0;
}

/**
 * Safe suppressions only (telemetry/debug/parity refresh), never canonical telecom.
 * @param {"duplicate_telemetry"|"debug_log"|"parity_refresh"} kind
 */
export function shouldSuppressNonCriticalWebhookWork(kind) {
  if (isSafeDeploymentMode() && kind === "duplicate_telemetry") {
    return false;
  }
  const sev = burstSeverity();
  const stats = getWebhookBurstStats();
  const hotProvider = stats.topKeys.some((x) => x.key.startsWith("p:") && x.count60s > 150);

  if (kind === "duplicate_telemetry") {
    return sev >= 1 && hotProvider;
  }
  if (kind === "debug_log") {
    return sev >= 2 || hotProvider;
  }
  if (kind === "parity_refresh") {
    return sev >= 2 || hotProvider;
  }
  return false;
}
