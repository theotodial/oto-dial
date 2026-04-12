import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import PhoneNumber from "../models/PhoneNumber.js";
import getTelnyxClient from "../services/telnyxService.js";
import { detectCountryFromPhoneNumber } from "../utils/countryUtils.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  isUnlimitedSubscription
} from "../services/unlimitedUsageService.js";
import { isParkOutboundEnabled } from "../services/telnyxParkedOutboundService.js";

const router = express.Router();
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

/** Strip accidental wrapping quotes from .env (common on Windows). */
function cleanEnvStr(value) {
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

function parseCommaList(value) {
  return parseCommaListRaw(cleanEnvStr(value));
}

function parseCommaListRaw(s) {
  if (!s) return [];
  return String(s)
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Preferred WebRTC auth: JWT from On-demand Telephony Credential (no SIP password in browser).
 * Create in Telnyx → link to your Credential Connection → copy ID into TELNYX_TELEPHONY_CREDENTIAL_ID.
 */
async function mintTelephonyJwtIfConfigured() {
  const id = cleanEnvStr(process.env.TELNYX_TELEPHONY_CREDENTIAL_ID);
  if (!id) return null;
  const telnyx = getTelnyxClient();
  if (!telnyx) return null;
  try {
    const raw = await telnyx.telephonyCredentials.createToken(id);
    const token =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && "data" in raw
          ? String(/** @type {{ data?: string }} */ (raw).data ?? "")
          : raw != null
            ? String(raw)
            : "";
    if (token) {
      console.log("[WebRTC] Minted JWT via telephony_credentials.createToken");
    }
    return token || null;
  } catch (err) {
    console.warn(
      "[WebRTC] telephonyCredentials.createToken failed:",
      extractTelnyxError(err)
    );
    return null;
  }
}

function getTelnyxAuthHeaders() {
  if (!process.env.TELNYX_API_KEY) return null;
  return {
    Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    "Content-Type": "application/json"
  };
}

function extractTelnyxError(err) {
  if (!err) return "Unknown Telnyx error";
  return (
    err?.response?.data?.errors?.[0]?.detail ||
    err?.response?.data?.errors?.[0]?.title ||
    err?.response?.data?.error ||
    err?.message ||
    "Unknown Telnyx error"
  );
}

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildTelnyxVoiceWebhookUrl() {
  const explicit = cleanEnvStr(process.env.TELNYX_VOICE_WEBHOOK_URL);
  if (explicit) {
    const base = trimTrailingSlash(explicit);
    return base.endsWith("/api/webhooks/telnyx/voice")
      ? base
      : `${base}/api/webhooks/telnyx/voice`;
  }

  const base = trimTrailingSlash(cleanEnvStr(process.env.BACKEND_URL));
  if (!base) return null;
  return `${base}/api/webhooks/telnyx/voice`;
}

function buildCredentialWebhookPatchPayload(webhookUrl) {
  const timeoutRaw = Number(process.env.TELNYX_WEBHOOK_TIMEOUT_SECS || 25);
  const timeoutSecs = Number.isFinite(timeoutRaw)
    ? Math.min(30, Math.max(5, Math.round(timeoutRaw)))
    : 25;
  return {
    webhook_event_url: webhookUrl,
    webhook_event_failover_url: webhookUrl,
    webhook_api_version: "2",
    webhook_timeout_secs: timeoutSecs,
  };
}

function credentialWebhookDiffers(currentConn, webhookUrl) {
  const desiredUrl = trimTrailingSlash(webhookUrl);
  const currentUrl = trimTrailingSlash(currentConn?.webhook_event_url);
  const failoverUrl = trimTrailingSlash(currentConn?.webhook_event_failover_url);
  const apiVersion =
    currentConn?.webhook_api_version != null
      ? String(currentConn.webhook_api_version).trim()
      : "";
  const timeout = Number(currentConn?.webhook_timeout_secs);
  return (
    currentUrl !== desiredUrl ||
    failoverUrl !== desiredUrl ||
    apiVersion !== "2" ||
    !Number.isFinite(timeout) ||
    timeout < 5
  );
}

/** NANP toll-free → Telnyx Outbound Voice Profile often needs `uitf` (not only `US`). */
function isUsTollFreeE164(e164) {
  const d = String(e164 || "").replace(/[^\d+]/g, "");
  return /^\+1(800|888|877|866|855|844|833|822)\d{7}$/.test(d);
}

/** Credential connections expose OVP id under `outbound` and/or as a flat field (API versions / denormalization). */
function getOutboundVoiceProfileIdFromCredentialConnection(conn) {
  if (!conn || typeof conn !== "object") return null;
  const nested = conn.outbound?.outbound_voice_profile_id;
  if (nested != null && String(nested).trim() !== "") {
    return String(nested).trim();
  }
  const flat = conn.outbound_voice_profile_id;
  if (flat != null && String(flat).trim() !== "") {
    return String(flat).trim();
  }
  return null;
}

/**
 * Telnyx expects outbound voice profile on credential SIP connections under `outbound.outbound_voice_profile_id`.
 * For NANP (+1 US/CA + toll-free), also set `localization` and (for toll-free) `ani_override` so PSTN toll-free
 * legs complete instead of failing at answer with EXCHANGE_ROUTING_ERROR (cause 25).
 *
 * @param {object|null} connection — credential_connections GET `data`
 * @param {string} profileId
 * @param {{ callerNumber?: string | null, destinationNumber?: string | null } | null} dialContext
 */
function buildCredentialOutboundPatchPayload(connection, profileId, dialContext = null) {
  const existing =
    connection?.outbound != null && typeof connection.outbound === "object"
      ? { ...connection.outbound }
      : {};
  const out = {
    ...existing,
    outbound_voice_profile_id: String(profileId),
  };
  // Prefer direct WebRTC outbound by default. Parked outbound requires a fully working
  // public webhook bridge and has been the source of pre-ringing production failures.
  out.call_parking_enabled = false;

  if (!dialContext) {
    return { outbound: out };
  }

  const destRaw = dialContext.destinationNumber
    ? String(dialContext.destinationNumber).trim()
    : "";
  const destDigits = destRaw.replace(/[^\d+]/g, "");
  const destCountry = destRaw ? detectCountryFromPhoneNumber(destRaw) : null;

  const nanpLike =
    (destRaw && isUsTollFreeE164(destRaw)) ||
    destCountry === "US" ||
    destCountry === "CA" ||
    (destDigits.startsWith("+1") && destDigits.length >= 12);

  if (nanpLike) {
    if (!out.localization || String(out.localization).trim() === "") {
      out.localization = "US";
    }
  }

  const tf =
    Boolean(destRaw && isUsTollFreeE164(destRaw)) ||
    Boolean(destDigits && isUsTollFreeE164(destDigits));
  if (tf && process.env.TELNYX_SKIP_TF_ANI_OVERRIDE !== "true") {
    let ani = String(dialContext.callerNumber || "")
      .trim()
      .replace(/\s/g, "");
    if (ani && !ani.toLowerCase().startsWith("sip:")) {
      if (!ani.startsWith("+")) {
        const d = ani.replace(/\D/g, "");
        if (d.length === 10) ani = `+1${d}`;
        else if (d.length >= 8) ani = `+${d}`;
      }
      if (/^\+[1-9]\d{6,14}$/.test(ani)) {
        out.ani_override = ani;
        out.ani_override_type = "always";
      }
    }
  }

  return { outbound: out };
}

function credentialOutboundRoutingDiffers(currentConn, desiredPayload) {
  const c = currentConn?.outbound && typeof currentConn.outbound === "object" ? currentConn.outbound : {};
  const d = desiredPayload?.outbound && typeof desiredPayload.outbound === "object" ? desiredPayload.outbound : {};
  const keys = [
    "outbound_voice_profile_id",
    "localization",
    "ani_override",
    "ani_override_type",
    "call_parking_enabled",
  ];
  for (const k of keys) {
    if (k === "call_parking_enabled") {
      const cv = c[k] === true || c[k] === "true";
      const dv = d[k] === true || d[k] === "true";
      if (cv !== dv) return true;
      continue;
    }
    const cv = c[k] != null && String(c[k]).trim() !== "" ? String(c[k]).trim() : "";
    const dv = d[k] != null && String(d[k]).trim() !== "" ? String(d[k]).trim() : "";
    if (cv !== dv) return true;
  }
  return false;
}

/**
 * Point the caller ID at the WebRTC credential connection (voice). Missing/wrong connection_id → routing errors.
 */
async function ensureCallerNumberVoiceConnection({ headers, connectionId, callerNumber }) {
  const raw = String(callerNumber || "").trim().replace(/\s/g, "");
  if (!raw || raw.toLowerCase().startsWith("sip:")) {
    return { ok: true, skipped: true };
  }
  let e164 = raw;
  if (!e164.startsWith("+")) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return { ok: true, skipped: true };
    e164 = `+${digits}`;
  }

  try {
    const listResp = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers,
      params: { "filter[phone_number]": e164, "page[size]": 10 },
    });
    const rows = listResp?.data?.data;
    if (!Array.isArray(rows) || !rows.length) {
      return {
        ok: false,
        reason: `No Telnyx inventory for ${e164} on this API key (buy the number here or fix caller ID).`,
      };
    }
    const row = rows[0];
    const id = row?.id;
    const cur = row?.connection_id;
    if (!id) {
      return { ok: false, reason: "Telnyx phone_numbers list returned no id" };
    }
    if (cur != null && String(cur) === String(connectionId)) {
      return { ok: true, unchanged: true };
    }
    await axios.patch(
      `${TELNYX_API_BASE_URL}/phone_numbers/${encodeURIComponent(id)}`,
      { connection_id: String(connectionId) },
      { headers }
    );
    return { ok: true, updated: true };
  } catch (err) {
    return { ok: false, reason: extractTelnyxError(err) };
  }
}

async function retrieveTelnyxConnection({ connectionId, headers }) {
  const attempted = [];
  const tryGet = async (path, type) => {
    attempted.push(path);
    const resp = await axios.get(`${TELNYX_API_BASE_URL}${path}`, { headers });
    return { type, data: resp?.data?.data || null, attempted };
  };

  // WebRTC uses Credential Connections. Some deployments mistakenly set TELNYX_CONNECTION_ID
  // to an IP connection or other voice connection type. Probe both so we can return an
  // actionable error message instead of a generic 502.
  try {
    return await tryGet(`/credential_connections/${encodeURIComponent(connectionId)}`, "credential");
  } catch (err) {
    const status = err?.response?.status;
    // Only fallback on "not found"/client errors; if Telnyx is down, bubble up.
    if (status && status >= 500) {
      err.attempted = attempted;
      throw err;
    }
  }

  try {
    return await tryGet(`/ip_connections/${encodeURIComponent(connectionId)}`, "ip");
  } catch (err) {
    err.attempted = attempted;
    throw err;
  }
}

/**
 * GET /api/webrtc/token
 * Generates a JWT token for Telnyx WebRTC client authentication
 */
router.get("/token", async (req, res) => {
  try {
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    if (req.subscription.isCallEnabled === false) {
      return res.status(403).json({
        error: "Calling is not included in your current plan.",
      });
    }

    const unlimitedGate = await checkUnlimitedUsageBeforeAction({
      subscriptionId: req.subscription.id,
      userId: req.userId,
      channel: "webrtc_token"
    });

    if (!unlimitedGate.allowed) {
      return res.status(403).json(createSuspiciousActivityErrorPayload());
    }

    const unlimitedPlan = isUnlimitedSubscription(
      unlimitedGate.subscription || req.subscription
    );

    if (!unlimitedPlan && (req.subscription.minutesRemaining || 0) <= 0) {
      return res.status(403).json({
        error: "No minutes remaining. Please upgrade your plan or wait for your next billing cycle."
      });
    }

    // Get user's phone numbers
    let numbers = req.subscription.numbers || [];
    
    // Fallback: query PhoneNumber directly
    if (!numbers.length) {
      const phoneNumbers = await PhoneNumber.find({
        userId: req.userId,
        status: "active"
      }).lean();
      numbers = phoneNumbers.map(n => ({ phoneNumber: n.phoneNumber }));
    }

    if (!numbers.length) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    const callerIdNumber = numbers[0].phoneNumber;
    const sipUsername = cleanEnvStr(process.env.TELNYX_SIP_USERNAME);
    const sipPasswordServer = cleanEnvStr(process.env.TELNYX_SIP_PASSWORD);
    const connectionId = cleanEnvStr(process.env.TELNYX_CONNECTION_ID);

    if (!sipUsername || !connectionId) {
      console.error("Missing TELNYX_SIP_USERNAME or TELNYX_CONNECTION_ID");
      return res.status(503).json({ error: "WebRTC not configured" });
    }

    // SIP password on the server → use classic login/password in the browser only. Do not mint JWT
    // (avoids Telnyx credential JWT vs SIP credential mismatch; most deployments use SIP only).
    // Set TELNYX_USE_TELEPHONY_JWT=true to also mint JWT when both are configured (advanced).
    const forceTelephonyJwt = process.env.TELNYX_USE_TELEPHONY_JWT === "true";
    let loginToken = null;
    if (!sipPasswordServer || forceTelephonyJwt) {
      loginToken = await mintTelephonyJwtIfConfigured();
    }

    // Password may live only on the client (VITE_TELNYX_SIP_PASSWORD). Do not 503 — otherwise
    // the browser never gets username/connectionId and cannot fall back to the Vite env.
    if (!loginToken && !sipPasswordServer) {
      console.warn(
        "[WebRTC] No JWT (set TELNYX_TELEPHONY_CREDENTIAL_ID) and no TELNYX_SIP_PASSWORD — client must use VITE_TELNYX_SIP_PASSWORD"
      );
    }

    // Return credentials for the client to use
    res.json({
      success: true,
      credentials: {
        sipUsername,
        ...(sipPasswordServer ? { sipPassword: sipPasswordServer } : {}),
        ...(loginToken ? { loginToken } : {}),
        connectionId,
        callerIdNumber,
        userId: req.userId.toString()
      }
    });
  } catch (err) {
    console.error("WebRTC token error:", err);
    res.status(500).json({ error: "Failed to generate WebRTC credentials" });
  }
});

/**
 * GET /api/webrtc/status
 * Check WebRTC connection status and provide debugging info
 */
router.get("/status", async (req, res) => {
  try {
    const connectionId = process.env.TELNYX_CONNECTION_ID;
    const sipUsername = process.env.TELNYX_SIP_USERNAME;
    const sipPasswordConfigured = Boolean(process.env.TELNYX_SIP_PASSWORD);
    const voiceWebhookUrl = buildTelnyxVoiceWebhookUrl();
    
    // Get user's phone numbers
    let numbers = req.subscription?.numbers || [];
    if (!numbers.length) {
      const phoneNumbers = await PhoneNumber.find({
        userId: req.userId,
        status: "active"
      }).lean();
      numbers = phoneNumbers.map(n => ({ phoneNumber: n.phoneNumber }));
    }
    
    res.json({
      success: true,
      status: {
        connectionId: connectionId || "NOT SET",
        sipUsername: sipUsername ? "SET" : "NOT SET",
        telnyxSipPassword: sipPasswordConfigured ? "SET" : "NOT SET",
        phoneNumbers: numbers.map(n => n.phoneNumber || n),
        webhookUrl: voiceWebhookUrl || "NOT SET",
        instructions: {
          step1: "Ensure TELNYX_CONNECTION_ID is set in backend .env",
          step2: "Ensure TELNYX_SIP_USERNAME is set in backend .env",
          step3:
            "Set TELNYX_SIP_PASSWORD on the server (recommended) or VITE_TELNYX_SIP_PASSWORD on the frontend (quote if password contains +)",
          step4: `Set webhook URL in Telnyx Connection: ${voiceWebhookUrl || 'YOUR_API_URL/api/webhooks/telnyx/voice'}`,
          step5: `Ensure each phone number has connection_id set to: ${connectionId || 'YOUR_CONNECTION_ID'}`,
          step6:
            "If your public API host differs from BACKEND_URL, set TELNYX_VOICE_WEBHOOK_URL explicitly so parked outbound can dial and bridge real PSTN calls.",
          step7: "Frontend WebRTC client must be connected and ready to receive calls"
        }
      }
    });
  } catch (err) {
    console.error("WebRTC status error:", err);
    res.status(500).json({ error: "Failed to get WebRTC status" });
  }
});

/**
 * POST /api/webrtc/repair-outbound
 * Best-effort: ensures the credential connection has a usable outbound voice profile
 * and that the profile allows the destination country.
 *
 * body: { destinationNumber?: string, callerNumber?: string }
 */
router.post("/repair-outbound", async (req, res) => {
  try {
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ success: false, error: "Active subscription required" });
    }

    if (req.subscription.isCallEnabled === false) {
      return res.status(403).json({
        success: false,
        error: "Calling is not included in your current plan.",
      });
    }

    const unlimitedGate = await checkUnlimitedUsageBeforeAction({
      subscriptionId: req.subscription.id,
      userId: req.userId,
      channel: "webrtc_repair_outbound"
    });

    if (!unlimitedGate.allowed) {
      return res.status(403).json(createSuspiciousActivityErrorPayload());
    }

    const headers = getTelnyxAuthHeaders();
    if (!headers) {
      return res.status(503).json({ success: false, error: "Telnyx not configured" });
    }

    const connectionId = cleanEnvStr(process.env.TELNYX_CONNECTION_ID);
    if (!connectionId) {
      return res.status(500).json({ success: false, error: "TELNYX_CONNECTION_ID not configured" });
    }

    const destinationNumber = String(req.body?.destinationNumber || "").trim() || null;
    const callerNumber = String(req.body?.callerNumber || "").trim() || null;
    const destinationCountry = destinationNumber ? detectCountryFromPhoneNumber(destinationNumber) : null;

    const result = {
      success: true,
      connectionId,
      destinationCountry,
      parkOutboundEnabled: isParkOutboundEnabled(),
      voiceWebhookUrl: buildTelnyxVoiceWebhookUrl(),
      actions: [],
      warnings: []
    };

    if (result.parkOutboundEnabled && !result.voiceWebhookUrl) {
      return res.status(500).json({
        success: false,
        error:
          "Parked outbound is enabled but no public Telnyx voice webhook URL is configured. Set TELNYX_VOICE_WEBHOOK_URL or BACKEND_URL to your public API host.",
        result,
      });
    }

    // 1) Retrieve connection (credential preferred).
    let connection = null;
    let connectionType = null;
    let attemptedEndpoints = [];
    try {
      const lookup = await retrieveTelnyxConnection({ connectionId, headers });
      connection = lookup.data;
      connectionType = lookup.type;
      attemptedEndpoints = lookup.attempted || [];
    } catch (err) {
      return res.status(502).json({
        success: false,
        error: `Unable to retrieve Telnyx connection ${connectionId}: ${extractTelnyxError(err)}`,
        attemptedEndpoints: err?.attempted || attemptedEndpoints,
        telnyxStatus: err?.response?.status || null,
        hint:
          "Verify TELNYX_CONNECTION_ID is valid in Telnyx Mission Control. For WebRTC, it MUST be a Credential Connection ID."
      });
    }

    result.connectionType = connectionType;
    result.attemptedEndpoints = attemptedEndpoints;

    if (connectionType !== "credential") {
      return res.status(400).json({
        success: false,
        error:
          `TELNYX_CONNECTION_ID (${connectionId}) is not a Credential Connection (found type: ${connectionType}). WebRTC requires a Credential Connection.`,
        hint:
          "Create/choose a Credential Connection in Telnyx (WebRTC) and set TELNYX_CONNECTION_ID + TELNYX_SIP_USERNAME + VITE_TELNYX_SIP_PASSWORD accordingly. If you're using Voice API only, do not force WebRTC.",
        result
      });
    }

    result.connectionUserName = connection?.user_name || null;
    const envUser = cleanEnvStr(process.env.TELNYX_SIP_USERNAME);
    result.envSipUsername = envUser || null;
    if (
      result.connectionUserName &&
      envUser &&
      String(result.connectionUserName).trim() !== String(envUser).trim()
    ) {
      result.warnings.push(
        `TELNYX_SIP_USERNAME (${envUser}) does not match the credential connection username (${result.connectionUserName}). This mismatch can cause CALL REJECTED.`
      );
    }

    // 2) Ensure connection is active.
    if (connection?.active === false) {
      try {
        await axios.patch(
          `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
          { active: true },
          { headers }
        );
        result.actions.push("activated_credential_connection");
      } catch (err) {
        result.warnings.push(`Could not activate connection: ${extractTelnyxError(err)}`);
      }
    }

    // 2a) Parked outbound requires a credential connection voice webhook so the server can
    // dial the PSTN leg and bridge it back to the parked WebRTC leg.
    if (result.parkOutboundEnabled && result.voiceWebhookUrl) {
      try {
        if (credentialWebhookDiffers(connection, result.voiceWebhookUrl)) {
          await axios.patch(
            `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
            buildCredentialWebhookPatchPayload(result.voiceWebhookUrl),
            { headers }
          );
          result.actions.push("updated_credential_connection_voice_webhook");
          const refreshed = await axios.get(
            `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
            { headers }
          );
          connection = refreshed?.data?.data || connection;
        } else {
          result.actions.push("credential_connection_voice_webhook_ok");
        }
      } catch (err) {
        return res.status(502).json({
          success: false,
          error: `Unable to configure credential connection voice webhook: ${extractTelnyxError(err)}`,
          result,
        });
      }
    }

    // 2b) Caller ID must use this credential connection for voice on the Telnyx side.
    if (callerNumber) {
      const vn = await ensureCallerNumberVoiceConnection({
        headers,
        connectionId,
        callerNumber,
      });
      if (vn.updated) result.actions.push("synced_caller_number_connection_id");
      if (vn.unchanged) result.actions.push("caller_number_connection_id_ok");
      if (!vn.ok && !vn.skipped && vn.reason) {
        result.warnings.push(`Caller voice connection: ${vn.reason}`);
      }
    }

    // 3) Ensure outbound voice profile exists.
    let outboundVoiceProfileId = getOutboundVoiceProfileIdFromCredentialConnection(connection);
    result.outboundVoiceProfileId = outboundVoiceProfileId;
    if (!outboundVoiceProfileId) {
      try {
        const profileName = `auto-outbound-${String(req.userId).slice(-6)}-${Date.now()}`;
        const createResp = await axios.post(
          `${TELNYX_API_BASE_URL}/outbound_voice_profiles`,
          {
            name: profileName,
            enabled: true,
            service_plan: "global",
            traffic_type: "conversational",
            usage_payment_method: "rate-deck",
          },
          { headers }
        );
        outboundVoiceProfileId = createResp?.data?.data?.id || null;
        if (outboundVoiceProfileId) {
          result.actions.push("created_outbound_voice_profile");
          result.outboundVoiceProfileId = outboundVoiceProfileId;
        }
      } catch (err) {
        return res.status(502).json({
          success: false,
          error: `Unable to create outbound voice profile: ${extractTelnyxError(err)}`
        });
      }

      if (outboundVoiceProfileId) {
        try {
          await axios.patch(
            `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
            buildCredentialOutboundPatchPayload(connection, outboundVoiceProfileId, {
              callerNumber,
              destinationNumber,
            }),
            { headers }
          );
          result.actions.push("attached_outbound_voice_profile_to_connection");
        } catch (err) {
          return res.status(502).json({
            success: false,
            error: `Unable to attach outbound voice profile to connection: ${extractTelnyxError(err)}`
          });
        }

        try {
          const connSnap = await axios.get(
            `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
            { headers }
          );
          const cSnap = connSnap?.data?.data || null;
          const pidAfter = getOutboundVoiceProfileIdFromCredentialConnection(cSnap);
          if (pidAfter && String(pidAfter) !== String(outboundVoiceProfileId)) {
            outboundVoiceProfileId = pidAfter;
            result.outboundVoiceProfileId = pidAfter;
            result.actions.push("refreshed_outbound_profile_id_from_credential_connection");
          }
        } catch {
          /* non-fatal */
        }
      }
    }

    // 4) Ensure outbound voice profile is enabled and allows destination country if we can detect it.
    if (outboundVoiceProfileId) {
      try {
        const profileResp = await axios.get(
          `${TELNYX_API_BASE_URL}/outbound_voice_profiles/${encodeURIComponent(outboundVoiceProfileId)}`,
          { headers }
        );
        const profile = profileResp?.data?.data || null;
        const whitelist = Array.isArray(profile?.whitelisted_destinations)
          ? profile.whitelisted_destinations
          : [];

        const replaceList = parseCommaList(process.env.TELNYX_REPLACE_OUTBOUND_WHITELIST);
        let next;
        if (replaceList.length) {
          next = new Set(replaceList);
          result.actions.push("using_TELNYX_REPLACE_OUTBOUND_WHITELIST");
        } else {
          next = new Set(whitelist);
          for (const c of parseCommaList(process.env.TELNYX_MERGE_OUTBOUND_WHITELIST)) {
            next.add(c);
          }
        }

        if (destinationCountry) next.add(destinationCountry);
        if (destinationNumber && isUsTollFreeE164(destinationNumber)) {
          next.add("US");
          next.add("uitf");
        } else if (destinationCountry === "US") {
          // Business dialers often mix local + toll-free; whitelisting `uitf` for all US destinations avoids
          // profile gaps when users switch between +1 local and +1-8xx without a separate repair shape.
          next.add("uitf");
        }
        if (!replaceList.length && !whitelist.length && destinationCountry === "US") {
          next.add("US");
        }

        const arrNext = Array.from(next);
        const tollFree = Boolean(destinationNumber && isUsTollFreeE164(destinationNumber));
        const planStr =
          profile?.service_plan != null && String(profile.service_plan).trim() !== ""
            ? String(profile.service_plan).toLowerCase()
            : "";
        const needsTollFreeServicePlanPatch = tollFree && planStr !== "global";
        const maxRateNum =
          profile?.max_destination_rate != null && profile.max_destination_rate !== ""
            ? Number(profile.max_destination_rate)
            : null;
        const needsMaxRateBump =
          tollFree &&
          maxRateNum != null &&
          !Number.isNaN(maxRateNum) &&
          maxRateNum > 0 &&
          maxRateNum < 3;

        const needsEnable = profile?.enabled === false;
        const listsDiffer =
          arrNext.length !== whitelist.length ||
          arrNext.some((c) => !whitelist.includes(c)) ||
          whitelist.some((c) => !arrNext.includes(c));
        const needsWhitelistPatch =
          listsDiffer || (whitelist.length === 0 && arrNext.length > 0);

        if (needsEnable || needsWhitelistPatch || needsTollFreeServicePlanPatch || needsMaxRateBump) {
          const payload = { enabled: true };
          if (needsWhitelistPatch) {
            payload.whitelisted_destinations = arrNext;
          }
          if (tollFree) {
            payload.service_plan = "global";
            payload.traffic_type = "conversational";
          }
          if (needsMaxRateBump) {
            payload.max_destination_rate = 20;
          }

          await axios.patch(
            `${TELNYX_API_BASE_URL}/outbound_voice_profiles/${encodeURIComponent(outboundVoiceProfileId)}`,
            payload,
            { headers }
          );

          if (needsEnable && profile?.enabled === false) {
            result.actions.push("enabled_outbound_voice_profile");
          }
          if (tollFree) {
            result.actions.push("set_outbound_voice_profile_service_plan_global");
          }
          if (needsMaxRateBump) {
            result.actions.push("raised_max_destination_rate_for_toll_free");
          }
          if (needsWhitelistPatch) {
            result.actions.push("updated_outbound_voice_profile_whitelist");
            if (arrNext.includes("uitf")) {
              result.actions.push("added_uitf_for_toll_free");
            }
          }
        }

        const snapResp = await axios.get(
          `${TELNYX_API_BASE_URL}/outbound_voice_profiles/${encodeURIComponent(outboundVoiceProfileId)}`,
          { headers }
        );
        const snap = snapResp?.data?.data;
        const snapList = Array.isArray(snap?.whitelisted_destinations)
          ? snap.whitelisted_destinations
          : [];
        result.outboundProfileSnapshot = {
          enabled: snap?.enabled,
          whitelisted_destinations: snapList,
          service_plan: snap?.service_plan ?? null,
          max_destination_rate: snap?.max_destination_rate ?? null,
        };
        if (
          destinationNumber &&
          isUsTollFreeE164(destinationNumber) &&
          !snapList.includes("uitf")
        ) {
          result.warnings.push(
            "Toll-free dial but outbound profile still has no `uitf` after API update. In Mission Control enable Special: Universal International Toll-Free, OR set TELNYX_REPLACE_OUTBOUND_WHITELIST=US,uitf in backend .env and restart."
          );
        }
      } catch (err) {
        result.warnings.push(`Could not verify/update outbound voice profile: ${extractTelnyxError(err)}`);
        if (err?.response?.data) {
          result.outboundVoiceProfileTelnyxError = err.response.data;
          console.error("[WebRTC repair-outbound] profile Telnyx error body:", err.response.data);
        }
      }
    }

    // 4c–4d) One credential GET: sync nested `outbound` (profile + US localization + TF ANI) and anchorsite.
    if (outboundVoiceProfileId) {
      try {
        const freshConnResp = await axios.get(
          `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
          { headers }
        );
        const freshConn = freshConnResp?.data?.data || null;
        const nestedRaw = freshConn?.outbound?.outbound_voice_profile_id;
        const nestedId =
          nestedRaw != null && String(nestedRaw).trim() !== ""
            ? String(nestedRaw).trim()
            : null;
        const desiredOutbound = buildCredentialOutboundPatchPayload(freshConn, outboundVoiceProfileId, {
          callerNumber,
          destinationNumber,
        });
        const needsNestedWrite =
          !nestedId ||
          String(nestedId) !== String(outboundVoiceProfileId) ||
          credentialOutboundRoutingDiffers(freshConn, desiredOutbound);
        if (needsNestedWrite) {
          await axios.patch(
            `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
            desiredOutbound,
            { headers }
          );
          result.actions.push("synced_credential_connection_outbound_routing");
        }

        const as =
          freshConn?.anchorsite_override != null ? String(freshConn.anchorsite_override).trim() : "";
        if (freshConn && as === "") {
          await axios.patch(
            `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
            { anchorsite_override: "Latency" },
            { headers }
          );
          result.actions.push("set_credential_anchorsite_latency");
        }
      } catch (err) {
        result.warnings.push(
          `Could not sync credential connection routing/anchorsite: ${extractTelnyxError(err)}`
        );
      }
    }

    // 5) Caller ID policy cannot always be auto-fixed via API.
    if (callerNumber) {
      result.warnings.push(
        "If CALL REJECTED persists, ensure this caller ID is a Telnyx-owned number assigned to the connection, or a Verified Number in Telnyx."
      );
    }

    result.hints = [
      "EXCHANGE_ROUTING_ERROR (cause 25): requires Outbound Voice Profile service_plan `global`, whitelists `US` + `uitf`, caller’s Telnyx number on this credential connection, and credential `outbound.localization` US + `outbound.ani_override` (E.164) for toll-free. This repair applies those automatically. If it persists, open a Telnyx ticket with call timestamps — some toll-free routes need account-level termination enablement.",
    ];

    if (result.actions?.length) {
      console.log("[WebRTC repair-outbound] actions:", result.actions);
    }

    return res.json(result);
  } catch (err) {
    console.error("WebRTC repair-outbound error:", err);
    return res.status(500).json({ success: false, error: "Failed to repair outbound calling" });
  }
});

/**
 * GET /api/webrtc/outbound-diagnostics
 * Live Telnyx credential + outbound profile (for EXCHANGE_ROUTING_ERROR / cause 25 triage).
 */
router.get("/outbound-diagnostics", async (req, res) => {
  try {
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ success: false, error: "Active subscription required" });
    }

    if (req.subscription.isCallEnabled === false) {
      return res.status(403).json({
        success: false,
        error: "Calling is not included in your current plan.",
      });
    }

    const headers = getTelnyxAuthHeaders();
    if (!headers) {
      return res.status(503).json({ success: false, error: "Telnyx not configured" });
    }

    const connectionId = cleanEnvStr(process.env.TELNYX_CONNECTION_ID);
    if (!connectionId) {
      return res.status(500).json({ success: false, error: "TELNYX_CONNECTION_ID missing" });
    }

    const lookup = await retrieveTelnyxConnection({ connectionId, headers });
    const connection = lookup.data;
    const envUser = cleanEnvStr(process.env.TELNYX_SIP_USERNAME);
    const connUser = connection?.user_name ? String(connection.user_name).trim() : "";

    let profile = null;
    const pid = getOutboundVoiceProfileIdFromCredentialConnection(connection);
    if (pid) {
      const pr = await axios.get(
        `${TELNYX_API_BASE_URL}/outbound_voice_profiles/${encodeURIComponent(pid)}`,
        { headers }
      );
      profile = pr?.data?.data || null;
    }

    return res.json({
      success: true,
      connectionType: lookup.type,
      connectionId,
      connectionActive: connection?.active ?? null,
      anchorsiteOverride: connection?.anchorsite_override ?? null,
      webhookEventUrl: connection?.webhook_event_url ?? null,
      webhookEventFailoverUrl: connection?.webhook_event_failover_url ?? null,
      webhookApiVersion: connection?.webhook_api_version ?? null,
      webhookTimeoutSecs: connection?.webhook_timeout_secs ?? null,
      outboundLocalization: connection?.outbound?.localization ?? null,
      outboundAniOverride: connection?.outbound?.ani_override ?? null,
      outboundAniOverrideType: connection?.outbound?.ani_override_type ?? null,
      credentialUserName: connUser || null,
      envSipUsername: envUser || null,
      usernameMatches: Boolean(envUser && connUser && envUser === connUser),
      outboundVoiceProfileId: pid || null,
      outboundProfileEnabled: profile?.enabled ?? null,
      servicePlan: profile?.service_plan ?? null,
      maxDestinationRate: profile?.max_destination_rate ?? null,
      whitelistedDestinations: profile?.whitelisted_destinations || [],
      tollFreeNote:
        "Toll-free (+1-8xx): profile needs `uitf` + service_plan `global`; credential connection needs `outbound.localization` US and `outbound.ani_override` (your E.164 caller ID) for many carriers. Run POST /api/webrtc/repair-outbound before dialing or check Mission Control.",
      expectedVoiceWebhookUrl: buildTelnyxVoiceWebhookUrl(),
    });
  } catch (e) {
    return res.status(502).json({ success: false, error: extractTelnyxError(e) });
  }
});

export default router;
