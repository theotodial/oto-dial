import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const contactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    name: {
      type: String,
      required: true
    },
    phoneNumber: {
      type: String,
      required: true
    },
    email: {
      type: String,
      default: ""
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

// Ensure unique phone number per user
contactSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });
contactSchema.index({ userId: 1, name: 1 });
contactSchema.plugin(mongoPerformancePlugin, { label: "contacts" });

export default mongoose.model("Contact", contactSchema);
