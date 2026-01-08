import express from "express";
import { getStripe } from "../../config/stripe.js";
import authenticateUser from "../middleware/authenticateUser.js";

const router = express.Router();

router.post("/checkout", authenticateUser, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "OTO Dial – Basic Plan" },
            recurring: { interval: "month" },
            unit_amount: 1999
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?cancel=true`,
      metadata: { userId: req.userId }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("STRIPE CHECKOUT ERROR:", err);
    res.status(500).json({ message: "Billing is currently unavailable" });
  }
});

export default router;
