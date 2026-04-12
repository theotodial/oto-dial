import mongoose from "mongoose";

/**
 * Prevents duplicate transactional emails when Stripe retries webhooks or when
 * multiple endpoints observe the same invoice (e.g. payment_succeeded + invoice.paid).
 */
const transactionalEmailLogSchema = new mongoose.Schema(
  {
    stripeInvoiceId: { type: String, required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: ["payment_success", "payment_failed"],
    },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

transactionalEmailLogSchema.index({ stripeInvoiceId: 1, kind: 1 }, { unique: true });

export default mongoose.model("TransactionalEmailLog", transactionalEmailLogSchema);
