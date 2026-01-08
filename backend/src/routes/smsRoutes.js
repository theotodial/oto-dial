import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import authenticateUser from "../middleware/authenticateUser.js";
import usageGuard from "../middleware/usageGuard.js";

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

    const message = await telnyx.messages.create({
      from: process.env.TELNYX_FROM_NUMBER,
      to,
      text
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
