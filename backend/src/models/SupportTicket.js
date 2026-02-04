import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    name: {
      type: String,
      required: true
    },

    email: {
      type: String,
      required: true,
      index: true
    },

    phone: {
      type: String,
      default: ""
    },

    subject: {
      type: String,
      default: ""
    },

    message: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
      index: true
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium"
    },

    adminNotes: {
      type: String,
      default: ""
    },

    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    resolvedAt: {
      type: Date,
      default: null
    },

    businessCategory: String,
    businessDescription: String,
    serviceRequest: String,
    isUrgent: Boolean
  },
  { timestamps: true }
);

export default mongoose.model("SupportTicket", supportTicketSchema);
