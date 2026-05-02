import mongoose from "mongoose";

const isolationSecurityAlertSchema = new mongoose.Schema(
  {
    severity: { type: String, enum: ["info", "warning", "critical"], required: true, index: true },
    event: { type: String, required: true, index: true },
    evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    quarantineStatus: {
      type: String,
      enum: ["open", "quarantined", "reviewed", "resolved"],
      default: "open",
      index: true,
    },
    fingerprint: { type: String, required: true, unique: true, index: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    occurrences: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.model("IsolationSecurityAlert", isolationSecurityAlertSchema);
