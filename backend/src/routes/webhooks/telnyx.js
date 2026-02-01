import express from "express";

const router = express.Router();

/**
 * LEGACY WEBHOOK ROUTE
 * This route is kept for backward compatibility with older webhook formats.
 * The main SMS webhook handler is at /api/webhooks/telnyx/sms (telnyxSms.js)
 * which already saves SMS to database and handles push notifications.
 */
router.post("/sms", async (req, res) => {
  const event = req.body?.data?.event_type;

  if (event !== "message.received") {
    return res.status(200).send("Ignored");
  }

  const payload = req.body.data.payload;

  const from = payload.from.phone_number;
  const to = payload.to[0].phone_number;
  const text = payload.text;

  console.log("📩 INBOUND SMS RECEIVED (legacy webhook format)");
  console.log("From:", from);
  console.log("To:", to);
  console.log("Text:", text);

  // Note: SMS saving is handled by the main webhook at /api/webhooks/telnyx/sms
  // This route is for legacy webhook format compatibility only

  res.status(200).send("OK");
});

export default router;
