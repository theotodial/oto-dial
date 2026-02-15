import express from "express";
import Stripe from "stripe";
import {
  processCheckoutCompleted,
  processInvoicePaymentSucceeded,
  processSubscriptionUpdated,
  processSubscriptionDeleted,
  isEventProcessed,
  markEventProcessed
} from "../services/stripeSubscriptionService.js";

const router = express.Router();

function getWebhookSecret() {
  return (
    process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_ENDPOINT_SECRET ||
    process.env.STRIPE_WEBHOOK_SIGNING_SECRET ||
    null
  );
}

/**
 * Get Stripe instance
 */
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ STRIPE_SECRET_KEY missing at runtime");
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/**
 * POST /api/webhooks/stripe
 * GUARANTEED SUBSCRIPTION PIPELINE
 * Zero-failure mode with idempotency and atomic transactions
 */
router.post("/", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(200).json({ disabled: true });
  }

  const sig = req.headers["stripe-signature"];
  let event;

  const webhookSecret = getWebhookSecret();
  if (!webhookSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET missing; cannot validate webhook signatures");
    return res.status(500).json({ error: "Webhook secret missing" });
  }

  // Verify Stripe signature
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );
  } catch (err) {
    console.error("❌ Stripe webhook signature verification failed:", err.message);
    return res.status(400).send("Webhook Error: Invalid signature");
  }

  const eventId = event.id;
  const eventType = event.type;

  console.log("Stripe event received:", event.type);
  console.log(`📥 Stripe webhook received: ${eventType} (${eventId})`);

  // IDEMPOTENCY CHECK - Prevent double processing
  const alreadyProcessed = await isEventProcessed(eventId);
  if (alreadyProcessed) {
    console.log(`⏭️ Event ${eventId} already processed, skipping`);
    return res.status(200).json({ received: true, skipped: true });
  }

  // Process event based on type
  try {
    let result = { success: false };

    switch (eventType) {
      case "checkout.session.completed":
        // Step 1: Create subscription in pending_activation state
        result = await processCheckoutCompleted(event, stripe);
        break;

      case "invoice.payment_succeeded":
        // Step 2: ACTIVATE subscription atomically
        // This is the GUARANTEED ACTIVATION POINT
        result = await processInvoicePaymentSucceeded(event, stripe);
        break;

      case "invoice.paid":
        // Some Stripe setups rely on invoice.paid in addition to invoice.payment_succeeded
        result = await processInvoicePaymentSucceeded(event, stripe);
        break;

      case "customer.subscription.created":
        // Handle subscription creation
        result = await processSubscriptionUpdated(event, stripe);
        break;

      case "customer.subscription.updated":
        // Handle subscription updates (upgrade/downgrade)
        result = await processSubscriptionUpdated(event, stripe);
        break;

      case "customer.subscription.deleted":
        // Handle subscription cancellation
        result = await processSubscriptionDeleted(event, stripe);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${eventType}`);
        // Mark as processed even if unhandled (to prevent retries)
        await markEventProcessed(eventId, eventType, true);
        return res.status(200).json({ received: true, unhandled: true });
    }

    // Mark event as successfully processed
    await markEventProcessed(eventId, eventType, result.success, result.error || null);

    if (result.success) {
      console.log(`✅ Event ${eventId} processed successfully`);
      return res.status(200).json({ received: true, processed: true });
    } else {
      console.error(`❌ Event ${eventId} processing failed:`, result.error);
      // Return 500 so Stripe retries instead of silently dropping paid events.
      return res.status(500).json({ received: true, processed: false, error: result.error });
    }
  } catch (err) {
    console.error(`❌ Error processing event ${eventId}:`, err);
    
    // Mark event as failed (will be retried by Stripe)
    await markEventProcessed(eventId, eventType, false, err.message);

    // Return non-2xx so Stripe retries this event.
    res.status(500).json({ received: true, error: err.message });
  }
});

export default router;
