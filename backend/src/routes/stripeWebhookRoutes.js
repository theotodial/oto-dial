import express from "express";
import Stripe from "stripe";
import User from "../models/User.js";

const router = express.Router();

/**
 * IMPORTANT:
 * Stripe must be initialized INSIDE request,
 * not at import time (ESM safe)
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
 * Stripe payment confirmation
 */
router.post("/", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(200).json({ disabled: true });
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Stripe webhook signature failed:", err.message);
    return res.status(400).send("Webhook Error");
  }

  // ✅ PAYMENT CONFIRMED
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    const customerId = invoice.customer;

    const user = await User.findOne({ stripeCustomerId: customerId });

    if (user) {
      user.subscriptionActive = true;
      user.plan = "basic";
      user.minutesRemaining = 2500;
      user.smsRemaining = 200;
      await user.save();

      console.log("✅ Subscription activated:", user.email);
    }
  }

  // ❌ SUBSCRIPTION CANCELED
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const user = await User.findOne({ stripeCustomerId: sub.customer });

    if (user) {
      user.subscriptionActive = false;
      await user.save();
      console.log("❌ Subscription canceled:", user.email);
    }
  }

  res.json({ received: true });
});

export default router;
