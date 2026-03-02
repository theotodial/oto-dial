import mongoose from "mongoose";

const notFoundLogSchema = new mongoose.Schema(
  {
    path: { type: String, required: true, index: true },
    method: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    lastIp: { type: String, default: "" },
    lastUserAgent: { type: String, default: "" }
  },
  { timestamps: true }
);

notFoundLogSchema.index({ path: 1, method: 1 }, { unique: true });

export default mongoose.model("NotFoundLog", notFoundLogSchema);

