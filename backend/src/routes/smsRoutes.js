import express from "express";
import { sendOutboundSms } from "../services/smsOutboundService.js";

const router = express.Router();

/**
 * POST /api/sms/send
 * body: { to, text }
 */
router.post("/send", async (req, res) => {
  const idempotencyKey =
    req.body?.idempotencyKey ??
    req.headers["x-idempotency-key"] ??
    req.headers["X-Idempotency-Key"];

  const result = await sendOutboundSms({
    userId: req.userId,
    to: req.body?.to,
    text: req.body?.text,
    idempotencyKey,
  });

  if (!result.ok) {
    return res.status(result.status || 500).json({
      error: result.error,
      ...(result.mongoId ? { mongoId: result.mongoId } : {}),
      ...(result.countryLocked
        ? { countryLocked: true, sourceCountry: result.sourceCountry }
        : {}),
      ...(result.status === 429 && result.retryAfterMs != null
        ? { retryAfterMs: result.retryAfterMs }
        : {}),
    });
  }

  return res.json({
    success: true,
    ...(result.messageId != null ? { messageId: result.messageId } : {}),
    ...(result.mongoId ? { mongoId: result.mongoId } : {}),
    ...(result.idempotent ? { idempotent: true } : {}),
    ...(result.queued ? { queued: true, status: result.status || "queued" } : {}),
  });
});

export default router;
