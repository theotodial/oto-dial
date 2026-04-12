import TransactionalEmailLog from "../models/TransactionalEmailLog.js";
import User from "../models/User.js";
import { sendEmailSafe } from "./email.service.js";
import { frontBase, paymentFailedEmail, paymentSuccessEmail } from "../emails/templates.js";

async function claimDedupe(stripeInvoiceId, kind) {
  try {
    await TransactionalEmailLog.create({ stripeInvoiceId, kind });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    console.error("❌ TransactionalEmailLog create failed:", err?.message || err);
    return false;
  }
}

/**
 * After subscription activation from a paid invoice (main Stripe webhook).
 */
export async function maybeSendInvoicePaymentSuccessEmail({ invoice, userId }) {
  const invoiceId = invoice?.id;
  if (!invoiceId) return;

  const claimed = await claimDedupe(invoiceId, "payment_success");
  if (!claimed) return;

  let user = userId
    ? await User.findById(userId).select("email name firstName").lean()
    : null;
  const custEmail = String(invoice.customer_email || "").trim().toLowerCase();
  if (!user && custEmail) {
    user = await User.findOne({ email: custEmail }).select("email name firstName").lean();
  }

  const to = user?.email || invoice.customer_email;
  if (!to) {
    console.warn("⚠️ Payment success email skipped: no recipient for invoice", invoiceId);
    return;
  }

  const base = frontBase();
  const html = paymentSuccessEmail({
    dashboardUrl: `${base}/dashboard`,
  });

  await sendEmailSafe(
    {
      to,
      subject: "OTODIAL — payment received",
      html,
      emailType: "payment_success",
      templateUsed: "paymentSuccessEmail",
    },
    "stripe-invoice-paid"
  );
}

/**
 * invoice.payment_failed (main webhook or dedicated email webhook).
 */
export async function maybeSendInvoicePaymentFailedEmail({ invoice, toEmail, name }) {
  const invoiceId = invoice?.id;
  if (!invoiceId || !toEmail) return;

  const claimed = await claimDedupe(invoiceId, "payment_failed");
  if (!claimed) return;

  const base = frontBase();
  const html = paymentFailedEmail({
    billingUrl: `${base}/billing`,
  });

  await sendEmailSafe(
    {
      to: toEmail,
      subject: "OTODIAL — payment failed",
      html,
      emailType: "payment_failed",
      templateUsed: "paymentFailedEmail",
    },
    "stripe-invoice-failed"
  );
}
