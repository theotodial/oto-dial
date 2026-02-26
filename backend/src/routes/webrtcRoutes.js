import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import PhoneNumber from "../models/PhoneNumber.js";
import { detectCountryFromPhoneNumber } from "../utils/countryUtils.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  isUnlimitedSubscription
} from "../services/unlimitedUsageService.js";

const router = express.Router();
const TELNYX_API_BASE_URL = "https://api.telnyx.com/v2";

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

/**
 * GET /api/webrtc/token
 * Generates a JWT token for Telnyx WebRTC client authentication
 */
router.get("/token", async (req, res) => {
  try {
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
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
    const sipUsername = process.env.TELNYX_SIP_USERNAME;
    const connectionId = process.env.TELNYX_CONNECTION_ID;

    if (!sipUsername || !connectionId) {
      console.error("Missing TELNYX_SIP_USERNAME or TELNYX_CONNECTION_ID");
      return res.status(503).json({ error: "WebRTC not configured" });
    }

    // Return credentials for the client to use
    res.json({
      success: true,
      credentials: {
        sipUsername,
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
        phoneNumbers: numbers.map(n => n.phoneNumber || n),
        webhookUrl: process.env.BACKEND_URL 
          ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/voice`
          : "NOT SET",
        instructions: {
          step1: "Ensure TELNYX_CONNECTION_ID is set in backend .env",
          step2: "Ensure TELNYX_SIP_USERNAME is set in backend .env",
          step3: "Ensure VITE_TELNYX_SIP_PASSWORD is set in frontend .env",
          step4: `Set webhook URL in Telnyx Connection: ${process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/voice` : 'YOUR_BACKEND_URL/api/webhooks/telnyx/voice'}`,
          step5: `Ensure each phone number has connection_id set to: ${connectionId || 'YOUR_CONNECTION_ID'}`,
          step6: "Frontend WebRTC client must be connected and ready to receive calls"
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

    const connectionId = process.env.TELNYX_CONNECTION_ID;
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
      actions: [],
      warnings: []
    };

    // 1) Retrieve credential connection.
    let credentialConnection = null;
    try {
      const connResp = await axios.get(
        `${TELNYX_API_BASE_URL}/credential_connections/${encodeURIComponent(connectionId)}`,
        { headers }
      );
      credentialConnection = connResp?.data?.data || null;
    } catch (err) {
      return res.status(502).json({
        success: false,
        error: `Unable to retrieve credential connection ${connectionId}: ${extractTelnyxError(err)}`,
        hint:
          "Verify TELNYX_CONNECTION_ID points to a Credential Connection (WebRTC) in Telnyx Mission Control."
      });
    }

    result.connectionUserName = credentialConnection?.user_name || null;
    result.envSipUsername = process.env.TELNYX_SIP_USERNAME || null;
    if (
      result.connectionUserName &&
      result.envSipUsername &&
      String(result.connectionUserName) !== String(result.envSipUsername)
    ) {
      result.warnings.push(
        `TELNYX_SIP_USERNAME (${result.envSipUsername}) does not match the credential connection username (${result.connectionUserName}). This mismatch can cause CALL REJECTED.`
      );
    }

    // 2) Ensure connection is active.
    if (credentialConnection?.active === false) {
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

    // 3) Ensure outbound voice profile exists.
    let outboundVoiceProfileId = credentialConnection?.outbound_voice_profile_id || null;
    result.outboundVoiceProfileId = outboundVoiceProfileId;
    if (!outboundVoiceProfileId) {
      try {
        const profileName = `auto-outbound-${String(req.userId).slice(-6)}-${Date.now()}`;
        const createResp = await axios.post(
          `${TELNYX_API_BASE_URL}/outbound_voice_profiles`,
          { name: profileName, enabled: true },
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
            { outbound_voice_profile_id: outboundVoiceProfileId },
            { headers }
          );
          result.actions.push("attached_outbound_voice_profile_to_connection");
        } catch (err) {
          return res.status(502).json({
            success: false,
            error: `Unable to attach outbound voice profile to connection: ${extractTelnyxError(err)}`
          });
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

        const desiredDestinations = new Set(whitelist);
        if (destinationCountry) desiredDestinations.add(destinationCountry);

        const needsEnable = profile?.enabled === false;
        const needsWhitelistUpdate =
          destinationCountry && !whitelist.includes(destinationCountry);

        if (needsEnable || needsWhitelistUpdate) {
          const payload = {};
          if (needsEnable) payload.enabled = true;
          if (needsWhitelistUpdate) payload.whitelisted_destinations = Array.from(desiredDestinations);

          await axios.patch(
            `${TELNYX_API_BASE_URL}/outbound_voice_profiles/${encodeURIComponent(outboundVoiceProfileId)}`,
            payload,
            { headers }
          );

          if (needsEnable) result.actions.push("enabled_outbound_voice_profile");
          if (needsWhitelistUpdate) result.actions.push("updated_outbound_voice_profile_whitelist");
        }
      } catch (err) {
        result.warnings.push(`Could not verify/update outbound voice profile: ${extractTelnyxError(err)}`);
      }
    }

    // 5) Caller ID policy cannot always be auto-fixed via API.
    if (callerNumber) {
      result.warnings.push(
        "If CALL REJECTED persists, ensure this caller ID is a Telnyx-owned number assigned to the connection, or a Verified Number in Telnyx."
      );
    }

    return res.json(result);
  } catch (err) {
    console.error("WebRTC repair-outbound error:", err);
    return res.status(500).json({ success: false, error: "Failed to repair outbound calling" });
  }
});

export default router;
