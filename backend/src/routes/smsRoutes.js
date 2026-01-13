import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import authenticateUser from "../middleware/authenticateUser.js";
import usageGuard from "../middleware/usageGuard.js";
import SMS from "../models/SMS.js";

const router = express.Router();

/**
 * POST /api/sms/send
 * body: { to, text }
 */
router.post("/send", authenticateUser, usageGuard("sms"), async (req, res) => {
  try {
    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({ error: "Missing to or text" });
    }

    const numbers = req.subscription?.numbers || [];
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

    res.json({
      success: true,
      messageId: message.data.id
    });
  } catch (err) {
    console.error("SMS send failed:", err);
    res.status(500).json({ error: "Failed to send SMS" });
  }
});

export default router;
