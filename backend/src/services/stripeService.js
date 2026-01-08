import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function createInvoiceForUser(user, subscription) {
  const invoiceItem = await stripe.invoiceItems.create({
    customer: user.stripeCustomerId,
    amount: Math.round(subscription.usage.amountSpent * 100),
    currency: "usd",
    description: "Call usage charges"
  });

  const invoice = await stripe.invoices.create({
    customer: user.stripeCustomerId,
    auto_advance: true
  });

  return invoice;
}
