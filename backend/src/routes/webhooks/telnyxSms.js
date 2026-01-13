import express from "express";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";

const router = express.Router();

/**
 * TELNYX SMS WEBHOOK
 * Handles inbound SMS messages
 */
router.post("/", async (req, res) => {
  try {
    console.log("📱 SMS WEBHOOK RECEIVED:", JSON.stringify(req.body, null, 2));
    
    const payload = req.body?.data?.payload;
    if (!payload) {
      return res.json({ received: true });
    }

    const toNumber = payload.to?.[0]?.phone_number;
    const fromNumber = payload.from?.phone_number;
    const messageText = payload.text;
    const telnyxId = payload.id;

    if (!toNumber || !fromNumber || !messageText) {
      console.warn("SMS webhook missing required fields");
      return res.json({ received: true });
    }

    // Find the user who owns this phone number
    const phoneNumber = await PhoneNumber.findOne({ 
      phoneNumber: toNumber,
      status: "active"
    });

    const userId = phoneNumber?.userId || null;

    await SMS.create({
      user: userId,
      to: toNumber,
      from: fromNumber,
      body: messageText,
      status: "received",
      direction: "inbound",
      telnyxMessageId: telnyxId
    });

    console.log(`✅ Inbound SMS saved: ${fromNumber} -> ${toNumber}`);
    res.json({ received: true });
  } catch (err) {
    console.error("SMS webhook error:", err);
    res.json({ received: true }); // Never fail webhooks
  }
});

export default router;
