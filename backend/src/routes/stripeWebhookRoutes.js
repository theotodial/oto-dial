import express from "express";
import Stripe from "stripe";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";

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
      // Update user document for backwards compatibility
      user.subscriptionActive = true;
      user.plan = "basic";
      user.minutesRemaining = 2500;
      user.smsRemaining = 200;
      await user.save();

      // Also create/update Subscription document (THE MAIN SOURCE OF TRUTH)
      try {
        // Find or create Plan
        let plan = await Plan.findOne({ name: "Basic", active: true });
        if (!plan) {
          plan = await Plan.create({
            name: "Basic",
            price: 19.99,
            currency: "USD",
            limits: {
              minutesTotal: 2500,
              smsTotal: 200,
              numbersTotal: 1
            },
            active: true
          });
        }

        const now = new Date();
        const periodEnd = new Date();
        periodEnd.setDate(now.getDate() + 30);

        // Update existing or create new subscription
        await Subscription.findOneAndUpdate(
          { userId: user._id },
          {
            $set: {
              planId: plan._id,
              status: "active",
              periodStart: now,
              periodEnd,
              limits: {
                minutesTotal: plan.limits.minutesTotal,
                smsTotal: plan.limits.smsTotal,
                numbersTotal: plan.limits.numbersTotal
              },
              usage: {
                minutesUsed: 0,
                smsUsed: 0
              },
              addons: {
                minutes: 0,
                sms: 0
              }
            }
          },
          { upsert: true, new: true }
        );

        console.log("✅ Subscription document created/updated for:", user.email);
      } catch (subErr) {
        console.error("Error creating subscription document:", subErr);
      }

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

      // Also update Subscription document
      await Subscription.updateMany(
        { userId: user._id, status: "active" },
        { status: "cancelled" }
      );

      console.log("❌ Subscription canceled:", user.email);
    }
  }

  res.json({ received: true });
});

export default router;
