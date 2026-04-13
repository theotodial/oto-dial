import express from "express";
import { sendOutboundSms } from "../services/smsOutboundService.js";

const router = express.Router();

/**
 * POST /api/sms/send
 * body: { to, text }
 */
router.post("/send", async (req, res) => {
  const result = await sendOutboundSms({
    userId: req.userId,
    to: req.body?.to,
    text: req.body?.text,
  });

  if (!result.ok) {
    return res.status(result.status || 500).json({
      error: result.error,
      ...(result.countryLocked
        ? { countryLocked: true, sourceCountry: result.sourceCountry }
        : {}),
      ...(result.status === 429 && result.retryAfterMs != null
        ? { retryAfterMs: result.retryAfterMs }
        : {}),
    });
  }

  return res.json({ success: true, messageId: result.messageId });
});

export default router;
