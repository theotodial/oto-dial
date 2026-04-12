import axios from "axios";

/**
 * Best-effort hangup: try primary call_control_id first, then leg ids (A/B-leg mismatch).
 */
export async function hangupTelnyxByCallDoc(callDoc, apiKey) {
  if (!apiKey || !callDoc) {
    return { ok: false, error: "missing_api_key_or_call" };
  }
  const legs = Array.isArray(callDoc.telnyxLegControlIds)
    ? callDoc.telnyxLegControlIds
    : [];
  const ordered = [
    callDoc.telnyxCallControlId,
    ...legs,
  ].filter(Boolean);
  const ids = [...new Set(ordered.map((x) => String(x).trim()).filter(Boolean))];

  let lastErr = null;
  for (const id of ids) {
    try {
      await axios.post(
        `https://api.telnyx.com/v2/calls/${encodeURIComponent(id)}/actions/hangup`,
        {},
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("[TELNYX HANGUP] sent", { callId: String(callDoc._id), controlId: id });
      return { ok: true, controlId: id };
    } catch (e) {
      lastErr = e;
      console.warn("[TELNYX HANGUP] attempt failed", {
        controlId: id,
        status: e.response?.status,
        data: e.response?.data,
      });
    }
  }
  return {
    ok: false,
    error: lastErr?.message || "all_hangup_attempts_failed",
    telnyx: lastErr?.response?.data,
  };
}
