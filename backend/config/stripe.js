import Stripe from "stripe";

let stripe = null;

export function getStripe() {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("❌ STRIPE_SECRET_KEY missing — Stripe disabled");
      return null;
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
    });
    console.log("✅ Stripe initialized");
  }
  return stripe;
}
