import express from "express";
import { getStripe } from "../../config/stripe.js";
import authenticateUser from "../middleware/authenticateUser.js";
import User from "../models/User.js";
import Plan from "../models/Plan.js";

const router = express.Router();

router.post("/checkout", authenticateUser, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  try {
    // Get plan from request or default to "basic"
    const planKey = req.body.planKey || "basic";
    
    // Find plan
    let plan = await Plan.findOne({ name: planKey, active: true });
    if (!plan) {
      return res.status(400).json({ error: `Plan "${planKey}" not found` });
    }

    // Ensure user has Stripe customer ID
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user._id.toString() }
      });
      customerId = customer.id;
      
      // Save customer ID to user
      user.stripeCustomerId = customerId;
      await user.save();
    }

    // Create checkout session with REQUIRED metadata
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: plan.currency || "usd",
            product_data: { name: `OTO Dial – ${plan.name} Plan` },
            recurring: { interval: "month" },
            unit_amount: Math.round(plan.price * 100) // Convert to cents
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?cancel=true`,
      // REQUIRED METADATA for webhook processing
      metadata: {
        userId: req.userId.toString(),
        planKey: planKey
      }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("STRIPE CHECKOUT ERROR:", err);
    res.status(500).json({ message: "Billing is currently unavailable" });
  }
});

export default router;
