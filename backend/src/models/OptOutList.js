import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const optOutSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

optOutSchema.index({ userId: 1, phone: 1 }, { unique: true });
optOutSchema.plugin(mongoPerformancePlugin, { label: "opt_out_list" });

export default mongoose.model("OptOutList", optOutSchema);
