import "../loadEnv.js";
import axios from "axios";

function clean(value) {
  if (value == null) return "";
  let s = String(value).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildVoiceWebhookUrl() {
  const explicit = clean(process.env.TELNYX_VOICE_WEBHOOK_URL);
  if (explicit) {
    const base = trimTrailingSlash(explicit);
    return base.endsWith("/api/webhooks/telnyx/voice")
      ? base
      : `${base}/api/webhooks/telnyx/voice`;
  }

  const base = trimTrailingSlash(clean(process.env.BACKEND_URL));
  if (!base) return null;
  return `${base}/api/webhooks/telnyx/voice`;
}

async function main() {
  const apiKey = clean(process.env.TELNYX_API_KEY);
  const connectionId = clean(process.env.TELNYX_CONNECTION_ID);
  const voiceWebhookUrl = buildVoiceWebhookUrl();

  if (!apiKey) throw new Error("TELNYX_API_KEY missing");
  if (!connectionId) throw new Error("TELNYX_CONNECTION_ID missing");
  if (!voiceWebhookUrl) {
    throw new Error("TELNYX_VOICE_WEBHOOK_URL/BACKEND_URL missing");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const getUrl = `https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(
    connectionId
  )}`;

  const beforeResp = await axios.get(getUrl, { headers });
  const before = beforeResp?.data?.data || {};

  const patch = {
    webhook_event_url: voiceWebhookUrl,
    webhook_event_failover_url: voiceWebhookUrl,
    webhook_api_version: "2",
    webhook_timeout_secs: 25,
  };

  const needsPatch =
    String(before.webhook_event_url || "").trim() !== voiceWebhookUrl ||
    String(before.webhook_event_failover_url || "").trim() !== voiceWebhookUrl ||
    String(before.webhook_api_version || "").trim() !== "2" ||
    Number(before.webhook_timeout_secs || 0) < 5;

  if (needsPatch) {
    await axios.patch(getUrl, patch, { headers });
  }

  const afterResp = await axios.get(getUrl, { headers });
  const after = afterResp?.data?.data || {};

  console.log(
    JSON.stringify(
      {
        connectionId,
        userName: after.user_name || null,
        active: after.active ?? null,
        patched: needsPatch,
        expectedVoiceWebhookUrl: voiceWebhookUrl,
        webhookEventUrl: after.webhook_event_url || null,
        webhookEventFailoverUrl: after.webhook_event_failover_url || null,
        webhookApiVersion: after.webhook_api_version || null,
        webhookTimeoutSecs: after.webhook_timeout_secs || null,
        outbound: after.outbound || null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(
    err?.response?.data?.errors?.[0]?.detail ||
      err?.response?.data ||
      err?.message ||
      err
  );
  process.exit(1);
});
