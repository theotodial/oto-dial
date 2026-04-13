import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const campaignSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "running", "completed"],
      default: "draft",
      index: true,
    },
    messageBody: {
      type: String,
      default: "",
    },
    schedule: {
      type: {
        type: String,
        enum: ["immediate", "scheduled"],
        default: "immediate",
      },
      scheduledAt: {
        type: Date,
        default: null,
      },
    },
    /** Prevents duplicate cron/worker starts for the same campaign */
    sendLock: {
      type: Boolean,
      default: false,
      index: true,
    },
    sendLockedAt: {
      type: Date,
      default: null,
    },
    totalRecipients: {
      type: Number,
      default: 0,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    optedOutCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

campaignSchema.index({ userId: 1, createdAt: -1 });
campaignSchema.index({
  status: 1,
  "schedule.type": 1,
  "schedule.scheduledAt": 1,
  sendLock: 1,
});
campaignSchema.plugin(mongoPerformancePlugin, { label: "campaigns" });

export default mongoose.model("Campaign", campaignSchema);
