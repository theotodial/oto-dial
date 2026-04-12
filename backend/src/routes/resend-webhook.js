import express from "express";

/**
 * Resend event webhook — logs delivery lifecycle only.
 * Mounted at POST /api/webhooks/resend (see backend/index.js).
 * Does not touch Stripe or billing.
 */
const router = express.Router();

router.post("/", (req, res) => {
  try {
    const body = req.body || {};
    const type = body.type || body.event || body.event_type || "unknown";

    switch (type) {
      case "email.sent":
      case "email.delivered":
      case "email.opened":
      case "email.bounced":
        console.log("[Resend webhook]", type, {
          id: body.data?.email_id || body.data?.id || body.id || null,
        });
        break;
      default:
        console.log("[Resend webhook]", type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[Resend webhook] handler error:", err?.message || err);
    if (err?.stack) console.error(err.stack);
    return res.status(200).json({ received: true });
  }
});

export default router;
