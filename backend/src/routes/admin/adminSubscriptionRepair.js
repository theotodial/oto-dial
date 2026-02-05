import express from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import Plan from "../../models/Plan.js";
import {
  processInvoicePaymentSucceeded,
  processSubscriptionUpdated
} from "../../services/stripeSubscriptionService.js";

const router = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/**
 * POST /api/admin/subscriptions/resync/:userId
 * Re-sync user's subscription from Stripe
 */
router.post("/resync/:userId", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured" });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: "User has no Stripe customer ID" });
    }

    // Fetch all subscriptions from Stripe
    const stripeSubscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      limit: 100
    });

    const results = [];

    for (const stripeSub of stripeSubscriptions.data) {
      // Find or create subscription
      let subscription = await Subscription.findOne({
        stripeSubscriptionId: stripeSub.id
      });

      if (!subscription) {
        // Try to get planId from Stripe subscription metadata
        let plan = null;
        const planIdFromMetadata = stripeSub.metadata?.planId;
        
        if (planIdFromMetadata) {
          plan = await Plan.findById(planIdFromMetadata);
        }
        
        // Fallback to Basic Plan if no planId in metadata
        if (!plan) {
          plan = await Plan.findOne({ name: "Basic Plan", active: true });
        }
        
        if (!plan) {
          results.push({ error: "Plan not found - cannot create subscription" });
          continue;
        }

        subscription = await Subscription.create({
          userId: user._id,
          planId: plan._id,
          stripeSubscriptionId: stripeSub.id,
          planKey: plan.name, // Use plan name instead of hardcoded "basic"
          status: stripeSub.status === "active" ? "active" : "pending_activation",
          periodStart: new Date(stripeSub.current_period_start * 1000),
          periodEnd: new Date(stripeSub.current_period_end * 1000),
          limits: {
            minutesTotal: plan.limits.minutesTotal,
            smsTotal: plan.limits.smsTotal,
            numbersTotal: plan.limits.numbersTotal
          },
          usage: { minutesUsed: 0, smsUsed: 0 },
          addons: { minutes: 0, sms: 0 }
        });
      }

      // Update subscription from Stripe
      const event = {
        data: { object: stripeSub }
      };
      await processSubscriptionUpdated(event, stripe);

      results.push({
        subscriptionId: subscription._id,
        stripeSubscriptionId: stripeSub.id,
        status: subscription.status
      });
    }

    // Activate subscription if payment succeeded
    if (stripeSubscriptions.data.length > 0) {
      const activeSub = stripeSubscriptions.data.find(s => s.status === "active");
      if (activeSub) {
        const invoice = await stripe.invoices.list({
          subscription: activeSub.id,
          limit: 1
        });

        if (invoice.data.length > 0 && invoice.data[0].paid) {
          const invoiceEvent = {
            data: { object: invoice.data[0] }
          };
          await processInvoicePaymentSucceeded(invoiceEvent, stripe);
        }
      }
    }

    res.json({
      success: true,
      message: "Subscription re-synced from Stripe",
      results
    });
  } catch (err) {
    console.error("Resync error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/subscriptions/reattach/:subscriptionId
 * Manually reattach subscription to user
 */
router.post("/reattach/:subscriptionId", async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const user = await User.findById(subscription.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Atomically link subscription to user
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      subscription.status = "active";
      await subscription.save({ session });

      user.activeSubscriptionId = subscription._id;
      user.subscriptionActive = true;
      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: "Subscription reattached to user",
        subscriptionId: subscription._id,
        userId: user._id
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("Reattach error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/subscriptions/force-activate/:subscriptionId
 * Force activate subscription (admin only)
 */
router.post("/force-activate/:subscriptionId", async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const user = await User.findById(subscription.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Atomically activate
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      subscription.status = "active";
      await subscription.save({ session });

      user.activeSubscriptionId = subscription._id;
      user.subscriptionActive = true;
      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: "Subscription force-activated",
        subscriptionId: subscription._id,
        userId: user._id
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("Force activate error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
