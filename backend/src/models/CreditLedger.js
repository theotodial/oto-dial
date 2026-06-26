import mongoose from "mongoose";

const creditLedgerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "subscription_credit_grant",
        "outbound_attempt_charge",
        "call_event_charge",
        "connected_duration_charge",
        "sms_charge",
        "admin_adjustment",
        "refund",
        "add_on_purchase",
        "migration_conversion",
        "migration_reset",
        "failed_reservation_release",
        "reservation_hold",
        "risk_pricing_adjustment",
      ],
      required: true,
      index: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      default: null,
      index: true,
    },
    smsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMS",
      default: null,
      index: true,
    },
    direction: {
      type: String,
      enum: ["inbound", "outbound", null],
      default: null,
    },
    reason: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

creditLedgerSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("CreditLedger", creditLedgerSchema);
