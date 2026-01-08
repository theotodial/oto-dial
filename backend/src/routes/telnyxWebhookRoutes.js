import express from "express";
import Stripe from "stripe";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * ⚠️ IMPORTANT:
 * Do NOT initialize Stripe unless API key exists
 * Prevents app crash during local/dev setup
 */
let stripe = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn("⚠️ STRIPE_SECRET_KEY not set — Stripe webhooks disabled");
}

router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // Stripe not configured → safely ignore
    if (!stripe) {
      return res.json({ received: true });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("STRIPE WEBHOOK SIGNATURE ERROR:", err.message);
      return res.status(400).send("Webhook Error");
    }

    try {
      // ❌ Payment failed → suspend subscription
      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object;

        const user = await User.findOne({
          stripeCustomerId: invoice.customer
        });

        if (user) {
          await Subscription.updateMany(
            { userId: user._id, status: "active" },
            { status: "suspended" }
          );
        }
      }

      // ✅ Payment success → reactivate
      if (event.type === "invoice.paid") {
        const invoice = event.data.object;

        const user = await User.findOne({
          stripeCustomerId: invoice.customer
        });

        if (user) {
          await Subscription.updateMany(
            { userId: user._id },
            { status: "active" }
          );
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("STRIPE WEBHOOK ERROR:", err);
      return res.status(500).json({ error: "Stripe webhook failed" });
    }
  }
);

export default router;
