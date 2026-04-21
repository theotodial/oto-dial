import express from "express";
import { sendOutboundSms } from "../services/smsOutboundService.js";

const router = express.Router();

/**
 * POST /api/sms/send
 * body: { to, text }
 */
router.post("/send", async (req, res) => {
  const parseRecipients = () => {
    const fromBody = req.body?.toList ?? req.body?.recipients ?? req.body?.to;
    if (Array.isArray(fromBody)) return fromBody.map((x) => String(x || "").trim()).filter(Boolean);
    if (typeof fromBody === "string") {
      return fromBody
        .split(/[\n,;]+/)
        .map((x) => String(x || "").trim())
        .filter(Boolean);
    }
    return [];
  };
  const recipients = parseRecipients();
  const logTo = recipients.length > 1 ? `[bulk:${recipients.length}]` : recipients[0] || req.body?.to;
  console.log("[SMS API HIT]", {
    userId: req.userId,
    to: logTo,
    message: String(req.body?.text || "").slice(0, 500),
  });
  const idempotencyKey =
    req.body?.idempotencyKey ??
    req.headers["x-idempotency-key"] ??
    req.headers["X-Idempotency-Key"];
  if (recipients.length > 1) {
    const baseIdempotency = idempotencyKey || `bulk-${Date.now()}`;
    const settled = await Promise.all(
      recipients.map((to, idx) =>
        sendOutboundSms({
          userId: req.userId,
          to,
          text: req.body?.text,
          idempotencyKey: `${baseIdempotency}:${idx}`,
        })
      )
    );
    const queuedCount = settled.filter((r) => r.ok).length;
    if (queuedCount === 0) {
      const firstErr = settled.find((r) => !r.ok);
      return res.status(firstErr?.status || 500).json({
        error: firstErr?.error || "Bulk send failed",
      });
    }
    return res.json({
      success: true,
      status: "queued",
      totalRecipients: recipients.length,
      queuedRecipients: queuedCount,
      failedRecipients: recipients.length - queuedCount,
    });
  }

  const result = await sendOutboundSms({
    userId: req.userId,
    to: recipients[0] || req.body?.to,
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

  const responseStatus =
    result.status ||
    result.userFacingStatus ||
    (result.idempotent && result.messageId ? "sent" : null) ||
    (result.queued ? "queued" : null) ||
    "sent";

  return res.json({
    success: true,
    status: responseStatus,
    ...(result.messageId != null ? { messageId: result.messageId } : {}),
    ...(result.mongoId ? { mongoId: result.mongoId } : {}),
    ...(result.idempotent ? { idempotent: true } : {}),
    ...(result.queued ? { queued: true } : {}),
    ...(result.moderationPending ? { moderationPending: true } : {}),
  });
});

export default router;
