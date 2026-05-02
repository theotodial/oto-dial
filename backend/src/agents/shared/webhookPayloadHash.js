import crypto from "crypto";

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function hashPayload(payload) {
  return crypto.createHash("sha256").update(stableStringify(payload ?? {})).digest("hex");
}

export function extractWebhookEnvelope(body = {}) {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const payload = data.payload || body?.payload || body;
  const eventType = data.event_type || body?.event_type || null;
  const eventId = data.id || null;
  return { eventId: eventId ? String(eventId) : null, eventType, payload };
}
