import express from "express";
import Stripe from "stripe";
import {
  maybeSendInvoicePaymentFailedEmail,
  maybeSendInvoicePaymentSuccessEmail
} from "../services/transactionalInvoiceEmailService.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post(
  "/stripe-email",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET_EMAIL
      );
    } catch (err) {
      console.error("Stripe email webhook error:", err.message);
      return res.sendStatus(400);
    }

    try {
      switch (event.type) {
        case "invoice.paid":
          await maybeSendInvoicePaymentSuccessEmail({
            invoice: event.data.object,
            userId: null
          });
          break;

        case "invoice.payment_failed":
          await maybeSendInvoicePaymentFailedEmail({
            invoice: event.data.object,
            toEmail: event.data.object.customer_email,
            name: undefined
          });
          break;

        default:
          break;
      }

      return res.sendStatus(200);
    } catch (error) {
      console.error("Email webhook processing error:", error);
      return res.sendStatus(200);
    }
  }
);

export default router;
