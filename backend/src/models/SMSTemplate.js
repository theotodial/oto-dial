import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const smsTemplateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

smsTemplateSchema.index({ userId: 1, updatedAt: -1 });
smsTemplateSchema.plugin(mongoPerformancePlugin, { label: "sms_templates" });

export default mongoose.model("SMSTemplate", smsTemplateSchema);
