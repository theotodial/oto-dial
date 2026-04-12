import express from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import {
  processCheckoutCompleted,
  processInvoicePaymentSucceeded,
  processSubscriptionUpdated,
  processSubscriptionDeleted,
  isEventProcessed,
  markEventProcessed
} from "../services/stripeSubscriptionService.js";
import { createAdminNotification } from "../services/adminNotificationService.js";
import { markAffiliateReferralPaid } from "../services/affiliateService.js";
import User from "../models/User.js";
import {
  maybeSendInvoicePaymentFailedEmail,
  maybeSendInvoicePaymentSuccessEmail
} from "../services/transactionalInvoiceEmailService.js";

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

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        let user = null;
        const mid = invoice.metadata || {};
        if (mid.userId && mongoose.Types.ObjectId.isValid(String(mid.userId))) {
          user = await User.findById(mid.userId).select("email name firstName").lean();
        }
        if (!user && invoice.customer) {
          user = await User.findOne({ stripeCustomerId: invoice.customer })
            .select("email name firstName")
            .lean();
        }
        const to = user?.email || invoice.customer_email;
        if (to) {
          await maybeSendInvoicePaymentFailedEmail({
            invoice,
            toEmail: to,
            name: user?.name || user?.firstName
          }).catch((err) => {
            console.warn("⚠️ Payment failed email helper error:", err.message);
          });
        }
        result = { success: true };
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${eventType}`);
        // Mark as processed even if unhandled (to prevent retries)
        await markEventProcessed(eventId, eventType, true);
        return res.status(200).json({ received: true, unhandled: true });
    }

    // Mark event as successfully processed
    await markEventProcessed(eventId, eventType, result.success, result.error || null);

    if (
      result.success &&
      (eventType === "invoice.payment_succeeded" || eventType === "invoice.paid")
    ) {
      const invoiceObject = event?.data?.object || {};
      const userId =
        result?.userId ||
        invoiceObject?.metadata?.userId ||
        invoiceObject?.lines?.data?.[0]?.metadata?.userId ||
        null;
      const subscriptionId = result?.subscriptionId || null;

      if (userId) {
        await markAffiliateReferralPaid({ userId, subscriptionId }).catch((err) => {
          console.warn(
            `⚠️ Failed to mark affiliate referral paid for user ${userId}:`,
            err.message
          );
        });
      }

      await createAdminNotification({
        type: "sale",
        title: "Stripe payment received",
        message: `Invoice ${invoiceObject?.id || "unknown"} was paid`,
        sourceModel: "StripeInvoice",
        sourceId: invoiceObject?.id || eventId,
        dedupeKey: `stripe_sale:${invoiceObject?.id || eventId}`,
        data: {
          amountPaid: Number(invoiceObject?.amount_paid || 0) / 100,
          currency: invoiceObject?.currency || "usd",
          userId: userId ? String(userId) : null,
          stripeCustomerId: invoiceObject?.customer || null,
          stripeSubscriptionId: invoiceObject?.subscription || null
        }
      }).catch((err) => {
        console.warn("⚠️ Failed to create sale notification:", err.message);
      });

      if (!result.skippedActivation && invoiceObject?.id) {
        await maybeSendInvoicePaymentSuccessEmail({
          invoice: invoiceObject,
          userId: userId || null
        }).catch((err) => {
          console.warn("⚠️ Payment success email helper error:", err.message);
        });
      }
    }

    if (result.success) {
      console.log(`✅ Event ${eventId} processed successfully`);
      return res.status(200).json({ received: true, processed: true });
    } else {
      console.error(`❌ Event ${eventId} processing failed:`, result.error);
      return res.status(500).json({
        received: true,
        processed: false,
        error: result.error || "Webhook processing failed"
      });
    }
  } catch (err) {
    console.error(`❌ Error processing event ${eventId}:`, err);
    
    // Mark event as failed (will be retried by Stripe)
    await markEventProcessed(eventId, eventType, false, err.message);
    return res.status(500).json({ received: true, error: err.message });
  }
});

export default router;
