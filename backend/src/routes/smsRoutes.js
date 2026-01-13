import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import SMS from "../models/SMS.js";
import PhoneNumber from "../models/PhoneNumber.js";
import Subscription from "../models/Subscription.js";

const router = express.Router();

/**
 * POST /api/sms/send
 * body: { to, text }
 * Note: authenticateUser and loadSubscription are applied in index.js
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

    // Check subscription is active
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "No active subscription" });
    }

    // Check SMS limits
    if (req.subscription.smsRemaining <= 0) {
      return res.status(403).json({ error: "SMS limit reached" });
    }

    // Get user's phone numbers from subscription (loaded by loadSubscription middleware)
    let numbers = req.subscription?.numbers || [];
    
    // Fallback: query PhoneNumber directly if not in subscription
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

    const fromNumber = numbers[0].phoneNumber;

    const message = await telnyx.messages.create({
      from: fromNumber,
      to,
      text
    });

    await SMS.create({
      user: req.userId,
      to,
      from: fromNumber,
      body: text,
      status: "sent",
      telnyxMessageId: message.data.id
    });

    // Update SMS usage count
    await Subscription.updateOne(
      { _id: req.subscription.id },
      { $inc: { "usage.smsUsed": 1 } }
    );

    res.json({
      success: true,
      messageId: message.data.id
    });
  } catch (err) {
    console.error("SMS send failed:", err);
    res.status(500).json({ error: "Failed to send SMS" });
  }
});

/**
 * GET /api/sms
 * Get SMS history for the current user
 */
router.get("/", async (req, res) => {
  try {
    const messages = await SMS.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      messages: messages.map(msg => ({
        id: msg._id,
        to: msg.to,
        from: msg.from,
        body: msg.body,
        status: msg.status,
        direction: msg.direction || "outbound",
        createdAt: msg.createdAt
      }))
    });
  } catch (err) {
    console.error("SMS fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch SMS" });
  }
});

export default router;
