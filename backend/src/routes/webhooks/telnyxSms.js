import express from "express";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Subscription from "../../models/Subscription.js";

const router = express.Router();

// Normalize phone number for comparison (strip + and spaces)
const normalizePhone = (phone) => {
  if (!phone) return "";
  return phone.replace(/[\s\-\(\)\+]/g, "");
};

/**
 * TELNYX SMS WEBHOOK
 * Handles inbound SMS messages
 */
router.post("/", async (req, res) => {
  try {
    console.log("📱 SMS WEBHOOK RECEIVED");
    console.log("📱 Headers:", JSON.stringify(req.headers, null, 2));
    console.log("📱 Body:", JSON.stringify(req.body, null, 2));
    
    // Handle different webhook payload formats
    const payload = req.body?.data?.payload || req.body?.payload || req.body;
    const eventType = req.body?.data?.event_type || req.body?.event_type;

    // Only process message.received events
    if (eventType && eventType !== "message.received") {
      console.log("📱 Ignoring non-message event:", eventType);
      return res.json({ received: true });
    }

    if (!payload) {
      console.log("📱 No payload in webhook");
      return res.json({ received: true });
    }

    // Extract data from different possible formats
    const toNumber = payload.to?.[0]?.phone_number || payload.to;
    const fromNumber = payload.from?.phone_number || payload.from;
    const messageText = payload.text || payload.body;
    const telnyxId = payload.id;

    if (!toNumber || !fromNumber || !messageText) {
      console.warn("SMS webhook missing required fields:", { toNumber, fromNumber, messageText: !!messageText });
      return res.json({ received: true });
    }

    console.log(`📱 Processing inbound SMS: ${fromNumber} -> ${toNumber}`);

    // Find the user who owns this phone number (try multiple formats)
    const normalizedTo = normalizePhone(toNumber);
    
    let phoneNumber = await PhoneNumber.findOne({ 
      phoneNumber: toNumber,
      status: "active"
    });

    // If not found, try without + prefix
    if (!phoneNumber) {
      phoneNumber = await PhoneNumber.findOne({ 
        phoneNumber: toNumber.startsWith("+") ? toNumber.slice(1) : `+${toNumber}`,
        status: "active"
      });
    }

    // If still not found, try normalized matching
    if (!phoneNumber) {
      const allNumbers = await PhoneNumber.find({ status: "active" });
      phoneNumber = allNumbers.find(n => normalizePhone(n.phoneNumber) === normalizedTo);
    }

    const userId = phoneNumber?.userId || null;

    if (!userId) {
      console.warn(`⚠️ Could not find owner for number: ${toNumber}`);
    }

    // Format numbers consistently for storage
    const formatPhone = (n) => n.startsWith("+") ? n : `+${n}`;

    const sms = await SMS.create({
      user: userId,
      to: formatPhone(toNumber),
      from: formatPhone(fromNumber),
      body: messageText,
      status: "received",
      direction: "inbound",
      telnyxMessageId: telnyxId
    });

    console.log(`✅ Inbound SMS saved: ${fromNumber} -> ${toNumber} (userId: ${userId || 'unknown'}) [id: ${sms._id}]`);

    // Send Web Push to user's devices (when app is closed or tab in background)
    if (userId) {
      try {
        const { sendPushToUser } = await import("../../services/pushService.js");
        const bodyPreview = (messageText || "").slice(0, 80);
        await sendPushToUser(userId, {
          title: "New message",
          body: bodyPreview ? `From ${fromNumber}: ${bodyPreview}` : `Message from ${fromNumber}`,
          data: { url: "/recents", from: fromNumber }
        });
      } catch (pushErr) {
        console.warn("Push notification error:", pushErr?.message);
      }
    }

    // Update usage tracking for inbound SMS
    // Both inbound and outbound SMS count toward usage
    if (userId) {
      try {
        await Subscription.updateOne(
          { userId: userId, status: "active" },
          { $inc: { "usage.smsUsed": 1 } }
        );
        console.log(`📊 Inbound SMS usage tracked for user ${userId}`);
      } catch (usageErr) {
        console.warn(`⚠️ Failed to track inbound SMS usage:`, usageErr.message);
      }
    }
    
    res.json({ received: true });
  } catch (err) {
    console.error("SMS webhook error:", err);
    res.json({ received: true }); // Never fail webhooks
  }
});

export default router;
