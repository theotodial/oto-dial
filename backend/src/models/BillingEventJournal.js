import mongoose from "mongoose";

/**
 * Append-only billing event journal for deterministic replay and drift detection.
 * Does not replace CreditLedger — mirrors successful billing mutations only.
 */

const billingEventJournalSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: 200,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      enum: ["call", "sms", "stripe", "migration", "system"],
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        "reserve",
        "attempt_charge",
        "interval_charge",
        "sms_charge",
        "release",
        "settle",
        "refund",
        "grant",
        "adjustment",
      ],
      required: true,
      index: true,
    },
    /** Signed credit delta applied to remainingCredits (same semantics as CreditLedger.amount). */
    amount: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    sourceService: {
      type: String,
      required: true,
      default: "unknown",
      maxlength: 200,
    },
    /** callId or smsId for correlation */
    correlationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    /** Original CreditLedger.type for audit */
    ledgerType: {
      type: String,
      default: null,
      maxlength: 64,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { versionKey: false }
);

billingEventJournalSchema.index({ userId: 1, timestamp: 1 });

export default mongoose.model("BillingEventJournal", billingEventJournalSchema);
