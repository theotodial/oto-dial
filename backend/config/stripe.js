import Stripe from "stripe";

let stripe = null;

export function getStripe() {
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) {
    return null;
  }

  if (!stripe) {
    stripe = new Stripe(key, {
      apiVersion: "2023-10-16",
    });
    console.log("✅ Stripe initialized");
  }
  return stripe;
}
