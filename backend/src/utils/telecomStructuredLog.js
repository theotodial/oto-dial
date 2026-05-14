/**
 * Structured telecom visibility (no secrets). Set TELECOM_STRUCTURED_LOG=0 to silence.
 * @param {string} tag e.g. "[CALL FLOW]" or "CALL FLOW"
 * @param {Record<string, unknown>} fields must align with ops dashboards; unknown keys allowed.
 */
export function telecomStructuredLog(tag, fields = {}) {
  if (process.env.TELECOM_STRUCTURED_LOG === "0") return;
  const raw = String(tag || "[CALL FLOW]").trim();
  const tagLine = raw.startsWith("[") && raw.endsWith("]") ? raw : `[${raw}]`;
  const timestamp = new Date().toISOString();
  const merged = {
    callId: fields.callId ?? null,
    userId: fields.userId ?? null,
    callControlId: fields.callControlId ?? null,
    currentStatus: fields.currentStatus ?? fields.state ?? null,
    eventType: fields.eventType ?? null,
    sourcePath: fields.sourcePath ?? "unknown",
    ...fields,
    timestamp,
  };
  console.log(tagLine, merged);
}
