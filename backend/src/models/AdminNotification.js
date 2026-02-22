import mongoose from "mongoose";

const adminNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["sale", "support", "blog", "affiliate_approval_request", "system"],
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true
    },
    message: {
      type: String,
      required: true
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    sourceModel: {
      type: String,
      default: null
    },
    sourceId: {
      type: String,
      default: null
    },
    dedupeKey: {
      type: String,
      default: null,
      unique: true,
      sparse: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("AdminNotification", adminNotificationSchema);
