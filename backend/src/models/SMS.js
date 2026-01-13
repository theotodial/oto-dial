import mongoose from "mongoose";

const smsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    to: {
      type: String,
      required: true
    },

    from: {
      type: String,
      required: true
    },

    body: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["queued", "sent", "delivered", "failed", "received"],
      default: "queued"
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "outbound"
    },

    telnyxMessageId: String
  },
  { timestamps: true }
);

export default mongoose.model("SMS", smsSchema);
