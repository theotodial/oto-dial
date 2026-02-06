import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import SMS from "../models/SMS.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Subscription from "../models/Subscription.js";

const router = express.Router();

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

    // 🔒 USAGE GUARD: Check remaining SMS > 0 before allowing outgoing SMS
    if (req.subscription.smsRemaining <= 0) {
      return res.status(403).json({ 
        error: "No SMS remaining. Please upgrade your plan or wait for your next billing cycle." 
      });
    }

    // 🔒 COUNTRY LOCK: Validate destination is in same country
    const phone = await PhoneNumber.findOne({
      userId: req.userId,
      status: "active"
    });
    
    if (phone && phone.lockedCountry !== false && phone.countryCode) {
      const { validateCountryLock } = await import("../utils/countryUtils.js");
      const validation = validateCountryLock(phone.countryCode, to);
      
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
    const toFormatted = format(to);

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

    // ✅ Usage tracking - deduct usage for outbound SMS
    if (req.subscription.id) {
      // Get subscription before update to log remaining balance
      const subscription = await Subscription.findById(req.subscription.id);
      
      if (subscription) {
        const smsUsedBefore = subscription.usage?.smsUsed || 0;
        const smsTotal = (subscription.limits?.smsTotal || 200) + (subscription.addons?.sms || 0);
        const smsRemainingBefore = Math.max(0, smsTotal - smsUsedBefore);

        // Deduct usage
        await Subscription.updateOne(
          { _id: req.subscription.id },
          { $inc: { "usage.smsUsed": 1 } }
        );

        // Calculate remaining after deduction
        const smsUsedAfter = smsUsedBefore + 1;
        const smsRemainingAfter = Math.max(0, smsTotal - smsUsedAfter);

        // Enhanced logging for debugging and cost tracking
        console.log(`📊 OUTBOUND SMS USAGE DEDUCTED:`);
        console.log(`   SMS: ${from} -> ${toFormatted}`);
        console.log(`   User: ${req.userId}`);
        console.log(`   Before: ${smsUsedBefore} SMS used, ${smsRemainingBefore} SMS remaining`);
        console.log(`   After: ${smsUsedAfter} SMS used, ${smsRemainingAfter} SMS remaining`);
      }
    }

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
