import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const campaignRecipientSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
    },
    variables: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "opted_out"],
      default: "pending",
      index: true,
    },
    messageId: {
      type: String,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

campaignRecipientSchema.index({ campaignId: 1, phone: 1 }, { unique: true });
campaignRecipientSchema.index({ campaignId: 1, status: 1 });
campaignRecipientSchema.index({ campaignId: 1, nextRetryAt: 1, status: 1 });
campaignRecipientSchema.plugin(mongoPerformancePlugin, { label: "campaign_recipients" });

export default mongoose.model("CampaignRecipient", campaignRecipientSchema);
