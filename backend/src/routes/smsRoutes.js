import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import SMS from "../models/SMS.js";
import PhoneNumber from "../models/PhoneNumber.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  isUnlimitedSubscription
} from "../services/unlimitedUsageService.js";
import { emitAdminLiveSms } from "../services/adminLiveEventsService.js";
import { evaluateFraudEvent } from "../services/fraudDetectionService.js";
import { enforceTelecomPolicy } from "../services/telecomPolicyService.js";
import { enforceUsageRateLimit } from "../services/usageRateLimitService.js";

const router = express.Router();

const SMS_OPT_OUT_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "HELP",
  "START",
  "UNSTOP"
]);

function normalizeSmsDestination(rawTo) {
  const value = String(rawTo || "").trim();
  if (!value) return null;

  if (value.startsWith("+")) {
    return value;
  }

  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return null;

  // Allow carrier short-code replies (e.g. STOP to 74843) without forcing E.164.
  if (/^\d{3,8}$/.test(digitsOnly)) {
    return digitsOnly;
  }

  return `+${digitsOnly}`;
}

function isLikelyShortCode(value) {
  return /^\d{3,8}$/.test(String(value || "").replace(/\D/g, ""));
}

/**
 * POST /api/sms/send
 * body: { to, text }
 */
router.post("/send", async (req, res) => {
  try {
    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({ error: "Missing to or text" });
    }

    const normalizedText = String(text || "").trim().toUpperCase();
    const toFormatted = normalizeSmsDestination(to);
    if (!toFormatted) {
      return res.status(400).json({ error: "Invalid destination number" });
    }

    const policyCheck = await enforceTelecomPolicy({
      userId: req.userId,
      channel: "sms",
      destinationNumber: toFormatted,
    });
    if (!policyCheck.allowed) {
      return res.status(403).json({ error: policyCheck.error });
    }

    const rateLimit = enforceUsageRateLimit({ userId: req.userId, channel: "sms" });
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "SMS rate limit exceeded. Please wait before sending more messages.",
        retryAfterMs: rateLimit.retryAfterMs,
      });
    }

    const fraudCheck = await evaluateFraudEvent({
      userId: req.userId,
      channel: "sms",
      destinationNumber: toFormatted,
    });
    if (!fraudCheck.allowed && fraudCheck.blocked) {
      return res.status(403).json({
        error: fraudCheck.reason || "SMS blocked by fraud protection.",
      });
    }

    // Check subscription exists
    if (!req.subscription) {
      return res.status(403).json({ error: "No active subscription" });
    }

    // Debug subscription data
    console.log("📱 SMS Send - Subscription check:", {
      userId: req.userId,
      active: req.subscription.active,
      subscriptionId: req.subscription.id
    });

    // 🔒 SINGLE SOURCE OF TRUTH
    if (!req.subscription.active) {
      return res.status(403).json({ error: "Subscription is not active" });
    }

    if (req.subscription.isSmsEnabled === false) {
      return res.status(403).json({ error: "SMS disabled by admin" });
    }

    const unlimitedGate = await checkUnlimitedUsageBeforeAction({
      subscriptionId: req.subscription.id,
      userId: req.userId,
      channel: "sms_outbound",
      smsIncrement: 1
    });

    if (!unlimitedGate.allowed) {
      return res.status(403).json(createSuspiciousActivityErrorPayload());
    }

    const unlimitedPlan = isUnlimitedSubscription(
      unlimitedGate.subscription || req.subscription
    );

    // Legacy plans keep existing remaining-SMS guard behavior.
    if (!unlimitedPlan && req.subscription.smsRemaining <= 0) {
      return res.status(403).json({ 
        error: "No SMS remaining. Please upgrade your plan or wait for your next billing cycle." 
      });
    }

    // 🔒 COUNTRY LOCK: Validate destination is in same country
    const phone = await PhoneNumber.findOne({
      userId: req.userId,
      status: "active"
    });
    
    const skipCountryLockForShortCode =
      isLikelyShortCode(toFormatted) && SMS_OPT_OUT_KEYWORDS.has(normalizedText);

    if (phone && phone.lockedCountry !== false && phone.countryCode && !skipCountryLockForShortCode) {
      const { validateCountryLock } = await import("../utils/countryUtils.js");
      const validation = validateCountryLock(phone.countryCode, toFormatted);
      
      if (!validation.valid) {
        console.log(`🚫 COUNTRY LOCK: Blocked SMS from ${phone.countryCode} to ${to}: ${validation.error}`);
        return res.status(403).json({ 
          error: validation.error,
          countryLocked: true,
          sourceCountry: phone.countryCode
        });
      }
    }

    if (!phone) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    if (!phone.messagingProfileId) {
      return res.status(400).json({
        error: "Messaging profile not configured for this number"
      });
    }

    const format = (n) => (n.startsWith("+") ? n : `+${n}`);
    const from = format(phone.phoneNumber);

    const response = await telnyx.messages.send({
      messaging_profile_id: phone.messagingProfileId,
      from,
      to: toFormatted,
      text
    });

    // Calculate SMS cost (Telnyx typically charges per SMS)
    // Default rate: $0.0075 per SMS (can be configured)
    const smsCostRate = Number(process.env.SMS_COST_RATE || 0.0075);
    const smsCost = smsCostRate; // Per SMS

    await SMS.create({
      user: req.userId,
      from,
      to: toFormatted,
      body: text,
      status: "sent",
      direction: "outbound",
      telnyxMessageId: response.data.id,
      cost: smsCost,
      costPerSms: smsCostRate,
      carrier: response.data.carrier || null,
      carrierFees: 0 // Can be enhanced with actual carrier fee data
    });

    emitAdminLiveSms({
      eventType: "sent",
      userId: req.userId,
      messageId: response.data.id,
      destination: toFormatted,
      from,
      status: "sent",
      bodyPreview: text,
    }).catch((error) => {
      console.warn("[ADMIN LIVE] failed to emit sms:", error?.message || error);
    });

    console.log(`✅ SMS sent from ${from} to ${toFormatted}`);
    res.json({ success: true, messageId: response.data.id });

  } catch (err) {
    console.error("SMS FAILED:", err.response?.data || err.message);
    
    // Extract Telnyx error details
    const telnyxError = err.response?.data?.errors?.[0];
    let errorMessage = "Failed to send SMS";
    
    if (telnyxError) {
      // Provide more helpful error messages
      if (telnyxError.code === "40021") {
        errorMessage = "Cannot send SMS to this number - it appears to be a landline or VoIP number, not a mobile phone.";
      } else if (telnyxError.detail) {
        errorMessage = telnyxError.detail;
      } else if (telnyxError.title) {
        errorMessage = telnyxError.title;
      }
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
