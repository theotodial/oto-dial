import os from "os";
import process from "node:process";
import { getPressureSnapshot } from "../services/telecomBackpressureService.js";

function workerId() {
  return String(process.env.pm_id || process.env.NODE_APP_INSTANCE || `${os.hostname()}:${process.pid}`);
}

/**
 * Ops-facing structured logs (additive). Not gated by TELECOM_STRUCTURED_LOG.
 * @param {string} tag e.g. "[BILLING HEALTH]"
 * @param {Record<string, unknown>} fields
 */
export function telecomOperationalLog(tag, fields = {}) {
  const raw = String(tag || "[OPS]").trim();
  const tagLine = raw.startsWith("[") && raw.endsWith("]") ? raw : `[${raw}]`;
  let pressureLevel = null;
  try {
    pressureLevel = getPressureSnapshot().pressureLevel ?? null;
  } catch {
    pressureLevel = null;
  }
  const payload = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    workerId: workerId(),
    pid: process.pid,
    pressureLevel,
    ...fields,
  };
  console.log(tagLine, payload);
}
