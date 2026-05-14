/**
 * Browser-side structured telecom logs (no tokens). Set VITE_TELECOM_STRUCTURED_LOG=0 to silence.
 * @param {string} tag e.g. "[MEDIA FLOW]"
 * @param {Record<string, unknown>} fields
 */
export function telecomStructuredLog(tag, fields = {}) {
  try {
    if (import.meta.env?.VITE_TELECOM_STRUCTURED_LOG === "0") return;
  } catch {
    /* ignore */
  }
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
