import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    telnyxCallControlId: {
      type: String,
      default: null
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    phoneNumber: {
      type: String,
      required: true
    },

    fromNumber: {
      type: String,
      default: null
    },

    toNumber: {
      type: String,
      default: null
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "outbound"
    },

    status: {
      type: String,
      enum: ["queued", "dialing", "ringing", "in-progress", "answered", "completed", "failed", "missed"],
      default: "queued"
    },

    callStartedAt: {
      type: Date,
      default: null
    },

    callEndedAt: {
      type: Date,
      default: null
    },

    durationSeconds: {
      type: Number,
      default: 0
    },

    hangupCause: {
      type: String,
      default: null
    },

    cost: {
      type: Number,
      default: 0
    },
    
    billedMinutes: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model("Call", callSchema);
