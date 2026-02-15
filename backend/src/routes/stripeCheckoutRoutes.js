import express from "express";
import { getStripe } from "../../config/stripe.js";
import authenticateUser from "../middleware/authenticateUser.js";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";
import Subscription from "../models/Subscription.js";
import {
  getCanonicalAddonPriceId,
  getCanonicalPlanPriceId
} from "../config/stripeCatalog.js";

const router = express.Router();

function extractClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim().length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

// Subscription checkout (recurring plan)
router.post("/checkout", authenticateUser, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  try {
    // Get planId from request (MongoDB plan ID)
    const planId = req.body.planId;
    
    if (!planId) {
      return res.status(400).json({ error: "planId is required" });
    }

    // Find plan by MongoDB ID
    const plan = await Plan.findById(planId);
    if (!plan || !plan.active) {
      return res.status(400).json({ error: "Plan not found or inactive" });
    }

    const effectivePriceId = getCanonicalPlanPriceId(plan);
    if (!effectivePriceId) {
      return res.status(400).json({
        error: "Plan is missing Stripe price configuration. Please contact support."
      });
    }

    if (plan.stripePriceId !== effectivePriceId) {
      plan.stripePriceId = effectivePriceId;
      await plan.save();
    }

    // Verify plan has required Stripe IDs
    if (!plan.stripeProductId || !plan.stripePriceId) {
      return res.status(400).json({ 
        error: "Plan is missing Stripe configuration. Please contact support." 
      });
    }

    // Ensure user has Stripe customer ID
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let customerId = user.stripeCustomerId;
    const clientIp = extractClientIp(req);
    if (!customerId) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { 
          userId: user._id.toString(),
          planId: planId.toString(),
          clientIp: clientIp || ""
        }
      });
      customerId = customer.id;
      
      // Save customer ID to user
      user.stripeCustomerId = customerId;
      await user.save();
    } else {
      // Update customer metadata with planId
      await stripe.customers.update(customerId, {
        metadata: {
          userId: user._id.toString(),
          planId: planId.toString(),
          clientIp: clientIp || ""
        }
      });
    }

    // Create checkout session using canonical Stripe price ID.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: effectivePriceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?cancel=true`,
      subscription_data: {
        metadata: {
          userId: req.userId.toString(),
          planId: planId.toString(),
          planName: plan.name,
          purchaseType: "subscription",
          clientIp: clientIp || ""
        }
      },
      // REQUIRED METADATA for webhook processing
      metadata: {
        userId: req.userId.toString(),
        planId: planId.toString(), // MongoDB plan ID - CRITICAL for webhook
        planName: plan.name,
        purchaseType: "subscription",
        clientIp: clientIp || ""
      }
    });

    console.log(`✅ Checkout session created for plan ${plan.name} (${planId})`);

    res.json({ url: session.url });
  } catch (err) {
    console.error("STRIPE CHECKOUT ERROR:", err);
    res.status(500).json({ message: "Billing is currently unavailable" });
  }
});

// Add-on checkout (minutes / SMS top-ups)
router.post("/checkout/addon", authenticateUser, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  try {
    const addonId = req.body.addonId;

    if (!addonId) {
      return res.status(400).json({ error: "addonId is required" });
    }

    // Find add-on definition
    const addon = await AddonPlan.findById(addonId);
    if (!addon || !addon.active) {
      return res.status(400).json({ error: "Add-on not found or inactive" });
    }

    const effectiveAddonPriceId = getCanonicalAddonPriceId(addon);
    if (!effectiveAddonPriceId) {
      return res.status(400).json({
        error: "Add-on is missing Stripe price configuration. Please contact support."
      });
    }

    if (addon.stripePriceId !== effectiveAddonPriceId) {
      addon.stripePriceId = effectiveAddonPriceId;
      await addon.save();
    }

    // Ensure user exists
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure user has an active subscription before buying add-ons
    const activeSubscription = await Subscription.findOne({
      userId: user._id,
      status: "active"
    });

    if (!activeSubscription) {
      return res.status(400).json({
        error: "You need an active subscription before purchasing add-ons."
      });
    }

    // Ensure Stripe customer
    let customerId = user.stripeCustomerId;
    const clientIp = extractClientIp(req);
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user._id.toString(),
          clientIp: clientIp || ""
        }
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    } else {
      await stripe.customers.update(customerId, {
        metadata: {
          userId: user._id.toString(),
          clientIp: clientIp || ""
        }
      });
    }

    // Add-ons are one-time purchases and can be bought repeatedly.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: effectiveAddonPriceId,
          quantity: 1
        }
      ],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata: {
            userId: req.userId.toString(),
            addonId: addon._id.toString(),
            addonType: addon.type,
            addonQuantity: addon.quantity.toString(),
            purchaseType: "addon",
            clientIp: clientIp || ""
          }
        }
      },
      success_url: `${process.env.FRONTEND_URL}/billing?success=addon`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?cancel=addon`,
      metadata: {
        userId: req.userId.toString(),
        addonId: addon._id.toString(),
        addonType: addon.type,
        addonQuantity: addon.quantity.toString(),
        purchaseType: "addon",
        clientIp: clientIp || ""
      }
    });

    console.log(
      `✅ Add-on checkout session created for ${addon.name} (${addon._id}) for user ${user.email}`
    );

    res.json({ url: session.url });
  } catch (err) {
    console.error("STRIPE ADD-ON CHECKOUT ERROR:", err);
    res.status(500).json({ message: "Add-on checkout is currently unavailable" });
  }
});

export default router;
