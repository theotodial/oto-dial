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

    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "No active subscription" });
    }

    if (req.subscription.smsRemaining <= 0) {
      return res.status(403).json({ error: "SMS limit reached" });
    }

    // 🔒 SINGLE SOURCE OF TRUTH
    const phone = await PhoneNumber.findOne({
      userId: req.userId,
      status: "active"
    });

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

    await SMS.create({
      user: req.userId,
      from,
      to: toFormatted,
      body: text,
      status: "sent",
      direction: "outbound",
      telnyxMessageId: response.data.id
    });

    await Subscription.updateOne(
      { _id: req.subscription.id },
      { $inc: { "usage.smsUsed": 1 } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("SMS FAILED:", err.response?.data || err.message);
    res.status(500).json({
      error:
        err.response?.data?.errors?.[0]?.detail ||
        "Failed to send SMS"
    });
  }
});

export default router;
