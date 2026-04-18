/**
 * Normalize Telnyx errors from the v4 Node SDK (APIError with `status` + `error` body)
 * and legacy axios-style (`response.data.errors`).
 */
/** @returns {string} Human-readable Telnyx error (all SDK shapes). */
export function extractTelnyxErrorMessage(err) {
  return extractTelnyxSdkError(err).userMessage;
}

export function extractTelnyxSdkError(err) {
  if (!err) {
    return { userMessage: "Unknown Telnyx error", httpStatus: 500, telnyxCode: null };
  }

  if (typeof err.status === "number" && err.error !== undefined) {
    const body = err.error;
    const arr =
      (Array.isArray(body?.errors) && body.errors) ||
      (Array.isArray(body?.data?.errors) && body.data.errors) ||
      null;
    const first = arr?.[0];
    const userMessage =
      first?.detail ||
      first?.title ||
      (first?.code != null ? String(first.code) : null) ||
      (typeof body?.message === "string" ? body.message : null) ||
      err.message ||
      "Telnyx request failed";
    const telnyxCode = first?.code ?? null;
    const httpStatus =
      err.status >= 400 && err.status <= 599 ? err.status : 500;
    return { userMessage, httpStatus, telnyxCode };
  }

  const legacyFirst =
    err?.raw?.errors?.[0] ||
    err?.response?.data?.errors?.[0] ||
    null;
  return {
    userMessage:
      legacyFirst?.detail ||
      legacyFirst?.title ||
      err?.response?.data?.error ||
      err?.message ||
      "Telnyx request failed",
    httpStatus: Number(err?.response?.status) || 500,
    telnyxCode: legacyFirst?.code ?? null,
  };
}
