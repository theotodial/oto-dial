function normalizeId(value) {
  if (value == null) return null;
  if (typeof value !== "object") return String(value);
  if (
    value._bsontype === "ObjectId" ||
    value.constructor?.name === "ObjectId" ||
    typeof value.toHexString === "function"
  ) {
    return typeof value.toHexString === "function" ? value.toHexString() : String(value);
  }
  if (Object.prototype.hasOwnProperty.call(value, "_id") && value._id && value._id !== value) {
    return normalizeId(value._id);
  }
  return String(value);
}

function summarizeCall(call) {
  if (!call || typeof call !== "object") return {};
  return {
    callId: normalizeId(call._id),
    userId: normalizeId(call.user),
    direction: call.direction || null,
    status: call.status || null,
    billedCallEvents: Array.isArray(call.billedCallEvents) ? call.billedCallEvents : undefined,
    creditReservationHeld: call.creditReservationHeld,
    creditReservationReleasedAt: call.creditReservationReleasedAt || null,
    attemptCharged: call.attemptCharged,
    attemptChargedAt: call.attemptChargedAt || null,
    durationCreditsCharged: call.durationCreditsCharged,
    callAnsweredAt: call.callAnsweredAt || null,
    callStartedAt: call.callStartedAt || null,
  };
}

function sanitize(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  if (typeof value !== "object") return value;
  if (
    value._bsontype === "ObjectId" ||
    value.constructor?.name === "ObjectId" ||
    typeof value.toHexString === "function"
  ) {
    return typeof value.toHexString === "function" ? value.toHexString() : String(value);
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = sanitize(item, seen);
  }
  return out;
}

export function billingTrace(functionName, phase, details = {}) {
  const disabled =
    String(process.env.TELECOM_BILLING_TRACE || "").toLowerCase() === "false" ||
    process.env.TELECOM_BILLING_TRACE === "0";
  if (disabled) return;
  try {
    console.warn("[BILLING TRACE]", {
      functionName,
      phase,
      ...sanitize(details),
      t: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[BILLING TRACE]", {
      functionName,
      phase,
      traceError: err?.message || String(err),
      t: new Date().toISOString(),
    });
  }
}

export function billingTraceEnter(functionName, details = {}) {
  billingTrace(functionName, "ENTER", details);
}

export function billingTraceExit(functionName, details = {}) {
  billingTrace(functionName, "EXIT", details);
}

export function billingTraceReturn(functionName, reason, details = {}) {
  billingTrace(functionName, "RETURN", { reason, ...details });
}

export function traceCall(call) {
  return summarizeCall(call);
}
