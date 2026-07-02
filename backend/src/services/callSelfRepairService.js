/**
 * Self-healing for outbound WebRTC calls — repairs Telnyx routing after instant failures
 * and keeps credential / OVP / whitelist aligned before and after dials.
 */
import axios from "axios";
import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";
import {
  getBaseOutboundWhitelistCountries,
  resolveTelnyxDestinationCountry
} from "../utils/countryUtils.js";

const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";
const REPAIR_COOLDOWN_MS = Number(process.env.CALL_SELF_REPAIR_COOLDOWN_MS || 90_000);
const WORKER_TICK_MS = Number(process.env.CALL_SELF_REPAIR_TICK_MS || 60_000);
const LOOKBACK_MS = Number(process.env.CALL_SELF_REPAIR_LOOKBACK_MS || 15 * 60_000);

const recentRepairs = new Map();

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

function getTelnyxHeaders() {
  if (!process.env.TELNYX_API_KEY) return null;
  return {
    Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    "Content-Type": "application/json"
  };
}

function parseCommaList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractTelnyxError(err) {
  return (
    err?.response?.data?.errors?.[0]?.detail ||
    err?.response?.data?.errors?.[0]?.title ||
    err?.message ||
    "Unknown Telnyx error"
  );
}

function isUsTollFreeE164(e164) {
  const d = String(e164 || "").replace(/[^\d+]/g, "");
  return /^\+1(800|888|877|866|855|844|833|822)\d{7}$/.test(d);
}

function repairKey(userId, destinationNumber) {
  const country = resolveTelnyxDestinationCountry(destinationNumber) || "any";
  return `${String(userId)}:${country}`;
}

function shouldThrottleRepair(userId, destinationNumber) {
  const key = repairKey(userId, destinationNumber);
  const last = recentRepairs.get(key) || 0;
  if (Date.now() - last < REPAIR_COOLDOWN_MS) return true;
  recentRepairs.set(key, Date.now());
  if (recentRepairs.size > 500) {
    const oldest = recentRepairs.keys().next().value;
    recentRepairs.delete(oldest);
  }
  return false;
}

async function getOutboundVoiceProfileId(connection) {
  const nested = connection?.outbound?.outbound_voice_profile_id;
  if (nested != null && String(nested).trim() !== "") return String(nested).trim();
  const flat = connection?.outbound_voice_profile_id;
  if (flat != null && String(flat).trim() !== "") return String(flat).trim();
  return null;
}

async function ensureCallerOnConnection({ headers, connectionId, callerNumber }) {
  const raw = String(callerNumber || "").trim().replace(/\s/g, "");
  if (!raw || raw.toLowerCase().startsWith("sip:")) return { ok: true, skipped: true };

  let e164 = raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`;
  try {
    const listResp = await axios.get(`${TELNYX_API_BASE_URL}/phone_numbers`, {
      headers,
      params: { "filter[phone_number]": e164, "page[size]": 5 }
    });
    const row = listResp?.data?.data?.[0];
    if (!row?.id) return { ok: false, reason: `No Telnyx number for ${e164}` };
    if (String(row.connection_id || "") === String(connectionId)) {
      return { ok: true, unchanged: true };
    }
    await axios.patch(
      `${TELNYX_API_BASE_URL}/phone_numbers/${encodeURIComponent(row.id)}`,
      { connection_id: String(connectionId) },
      { headers }
    );
    return { ok: true, updated: true };
  } catch (err) {
    return { ok: false, reason: extractTelnyxError(err) };
  }
}

/**
 * Best-effort Telnyx outbound repair (shared by worker, call create hook, and API route).
 */
export async function runOutboundCallSelfRepair({
  userId = null,
  destinationNumber = null,
  callerNumber = null,
  reason = "manual",
  force = false
} = {}) {
  const headers = getTelnyxHeaders();
  const connectionId = cleanEnvStr(process.env.TELNYX_CONNECTION_ID);
  if (!headers || !connectionId) {
    return { success: false, skipped: true, reason: "telnyx_not_configured" };
  }

  if (!force && userId && shouldThrottleRepair(userId, destinationNumber)) {
    return { success: true, skipped: true, reason: "cooldown" };
  }

  const destinationCountry = destinationNumber
    ? resolveTelnyxDestinationCountry(destinationNumber)
    : null;

  const result = {
    success: true,
    reason,
    destinationCountry,
    actions: [],
    warnings: []
  };

  try {
    const connResp = await axios.get(
      `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
      { headers }
    );
    let connection = connResp?.data?.data || null;
    if (!connection) {
      return { success: false, error: "credential_connection_not_found" };
    }

    if (connection.active === false) {
      await axios.patch(
        `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
        { active: true },
        { headers }
      );
      result.actions.push("activated_credential_connection");
    }

    let profileId = await getOutboundVoiceProfileId(connection);
    if (!profileId) {
      const createResp = await axios.post(
        `${TELNYX_API_BASE_URL}/outbound_voice_profiles`,
        {
          name: `auto-self-repair-${Date.now()}`,
          enabled: true,
          service_plan: "global",
          traffic_type: "conversational",
          usage_payment_method: "rate-deck"
        },
        { headers }
      );
      profileId = createResp?.data?.data?.id || null;
      if (profileId) {
        await axios.patch(
          `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
          {
            outbound: {
              ...(connection.outbound || {}),
              outbound_voice_profile_id: String(profileId),
              call_parking_enabled: false,
              ...(destinationCountry === "US" || String(destinationNumber || "").startsWith("+1")
                ? { localization: "US" }
                : {})
            }
          },
          { headers }
        );
        result.actions.push("created_and_attached_outbound_voice_profile");
      }
    }

    if (profileId) {
      const profileResp = await axios.get(
        `${TELNYX_API_BASE_URL}/outbound_voice_profiles/${encodeURIComponent(profileId)}`,
        { headers }
      );
      const profile = profileResp?.data?.data || {};
      const whitelist = Array.isArray(profile.whitelisted_destinations)
        ? profile.whitelisted_destinations
        : [];

      const next = new Set(whitelist);
      for (const code of getBaseOutboundWhitelistCountries()) next.add(code);
      for (const code of parseCommaList(process.env.TELNYX_MERGE_OUTBOUND_WHITELIST)) {
        next.add(code.toUpperCase());
      }
      if (destinationCountry) next.add(destinationCountry);
      if (destinationNumber && isUsTollFreeE164(destinationNumber)) {
        next.add("US");
        next.add("uitf");
      }

      const arrNext = Array.from(next);
      const listsDiffer =
        arrNext.length !== whitelist.length ||
        arrNext.some((c) => !whitelist.includes(c));

      if (profile.enabled === false || listsDiffer) {
        await axios.patch(
          `${TELNYX_API_BASE_URL}/outbound_voice_profiles/${encodeURIComponent(profileId)}`,
          {
            enabled: true,
            ...(listsDiffer ? { whitelisted_destinations: arrNext } : {})
          },
          { headers }
        );
        if (listsDiffer) result.actions.push("updated_outbound_voice_profile_whitelist");
        if (profile.enabled === false) result.actions.push("enabled_outbound_voice_profile");
      }

      const outboundPatch = {
        outbound: {
          ...(connection.outbound || {}),
          outbound_voice_profile_id: String(profileId),
          call_parking_enabled: false
        }
      };
      if (
        destinationCountry === "US" ||
        destinationCountry === "CA" ||
        String(destinationNumber || "").startsWith("+1")
      ) {
        outboundPatch.outbound.localization = "US";
      }
      await axios.patch(
        `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
        outboundPatch,
        { headers }
      );
      result.actions.push("synced_credential_outbound_routing");
    }

    let resolvedCaller = callerNumber;
    if (!resolvedCaller && userId) {
      const owned = await PhoneNumber.findOne({ userId, status: "active" })
        .select("phoneNumber")
        .lean();
      resolvedCaller = owned?.phoneNumber || null;
    }

    if (resolvedCaller) {
      const vn = await ensureCallerOnConnection({
        headers,
        connectionId,
        callerNumber: resolvedCaller
      });
      if (vn.updated) result.actions.push("synced_caller_number_connection_id");
      if (!vn.ok && !vn.skipped && vn.reason) {
        result.warnings.push(vn.reason);
      }
    }

    if (!connection.anchorsite_override) {
      await axios.patch(
        `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
        { anchorsite_override: "Latency" },
        { headers }
      );
      result.actions.push("set_credential_anchorsite_latency");
    }

    return result;
  } catch (err) {
    return {
      success: false,
      error: extractTelnyxError(err),
      actions: result.actions,
      warnings: result.warnings
    };
  }
}

export function queueOutboundCallSelfRepair(params = {}) {
  void runOutboundCallSelfRepair(params).catch((err) => {
    console.warn("[callSelfRepair] queue failed:", err?.message || err);
  });
}

async function repairRecentFailedCalls() {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const failedCalls = await Call.find({
    direction: "outbound",
    source: "webrtc",
    status: { $in: ["failed", "no-answer", "busy", "rejected", "canceled"] },
    durationSeconds: { $lte: 0 },
    updatedAt: { $gte: since }
  })
    .select("_id user phoneNumber fromNumber hangupCause status updatedAt")
    .sort({ updatedAt: -1 })
    .limit(40)
    .lean();

  const seenUsers = new Set();
  for (const call of failedCalls) {
    const userId = call.user ? String(call.user) : null;
    if (!userId || seenUsers.has(userId)) continue;
    seenUsers.add(userId);

    const repair = await runOutboundCallSelfRepair({
      userId,
      destinationNumber: call.phoneNumber || call.toNumber,
      callerNumber: call.fromNumber,
      reason: `auto_failed_call:${call._id}`
    });

    if (repair.actions?.length) {
      console.log("[callSelfRepair] repaired after failed call", {
        userId,
        callId: String(call._id),
        status: call.status,
        hangupCause: call.hangupCause || null,
        actions: repair.actions
      });
    }
  }
}

export function startCallSelfRepairWorker() {
  const timer = setInterval(() => {
    repairRecentFailedCalls().catch((err) => {
      console.warn("[callSelfRepair] worker tick failed:", err?.message || err);
    });
  }, WORKER_TICK_MS);

  if (typeof timer.unref === "function") timer.unref();
  console.log("[callSelfRepair] worker started");
}

export default {
  runOutboundCallSelfRepair,
  queueOutboundCallSelfRepair,
  startCallSelfRepairWorker
};
