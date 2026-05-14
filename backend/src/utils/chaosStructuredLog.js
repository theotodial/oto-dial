import os from "os";
import { telecomStructuredLog } from "./telecomStructuredLog.js";
import { getPressureSnapshot } from "../services/telecomBackpressureService.js";

/**
 * Forensics-only structured logs for chaos / replay / ordering detectors.
 * @param {string} tag e.g. "[CHAOS DETECTOR]"
 * @param {Record<string, unknown>} fields
 */
export function chaosStructuredLog(tag, fields = {}) {
  const snap = getPressureSnapshot();
  const base = {
    workerId: fields.workerId ?? null,
    hostname: fields.hostname ?? os.hostname(),
    pid: fields.pid ?? process.pid,
    callId: fields.callId ?? null,
    userId: fields.userId ?? null,
    economicVersion: fields.economicVersion ?? null,
    callStateVersion: fields.callStateVersion ?? null,
    timelineHash: fields.timelineHash ?? null,
    sequenceNumber: fields.sequenceNumber ?? null,
    pressureLevel: snap.pressureLevel,
    ...fields,
  };
  telecomStructuredLog(tag, base);
}
