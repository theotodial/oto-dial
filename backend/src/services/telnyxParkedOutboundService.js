import axios from "axios";

const TELNYX_API = "https://api.telnyx.com/v2";

export function isParkOutboundEnabled() {
  return process.env.TELNYX_WEBRTC_PARK_OUTBOUND === "true";
}

export function parseOtdFromTelnyxClientState(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object" && raw !== null) {
    const id = raw.otd ?? raw.otdCallId;
    return id != null && String(id).trim() !== "" ? String(id).trim() : null;
  }
  try {
    const s = String(raw).trim();
    let jsonStr;
    try {
      jsonStr = Buffer.from(s, "base64").toString("utf8");
    } catch {
      jsonStr = s;
    }
    const o = JSON.parse(jsonStr);
    const id = o?.otd ?? o?.otdCallId;
    return id != null && String(id).trim() !== "" ? String(id).trim() : null;
  } catch {
    return null;
  }
}

export function isWebhookParkedOutboundInitiated(callPayload) {
  const dir = String(callPayload?.direction || "").toLowerCase();
  const outgoing = dir === "outgoing" || dir === "outbound";
  const st = String(
    callPayload?.state || callPayload?.call_state || ""
  ).toLowerCase();
  return outgoing && st === "parked";
}

export async function dialPstnForParkedWebRtcLeg({
  agentCallControlId,
  to,
  from,
  connectionId,
  apiKey,
  webhookUrl,
}) {
  const body = {
    to,
    from,
    connection_id: String(connectionId),
  };
  if (webhookUrl) body.webhook_url = webhookUrl;

  const resp = await axios.post(
    `${TELNYX_API}/calls/${encodeURIComponent(agentCallControlId)}/actions/dial`,
    body,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );
  const root = resp?.data?.data ?? resp?.data ?? {};
  const pstnCc =
    root.call_control_id ??
    root.call_control_ids?.[0] ??
    root.id ??
    null;
  return {
    ok: true,
    pstnCallControlId: pstnCc != null ? String(pstnCc) : null,
    raw: resp?.data,
  };
}

export async function bridgeParkedWebRtcToPstn({
  agentCallControlId,
  pstnCallControlId,
  apiKey,
}) {
  await axios.post(
    `${TELNYX_API}/calls/${encodeURIComponent(agentCallControlId)}/actions/bridge`,
    { call_control_id: String(pstnCallControlId) },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );
  return { ok: true };
}
