import mongoose from "mongoose";

const usageLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true
    },

    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: true
    },

    minutesUsed: {
      type: Number,
      required: true
    },

    type: {
      type: String,
      enum: ["call", "sms"],
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("UsageLog", usageLogSchema);
