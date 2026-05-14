import mongoose from "mongoose";

const SNAPSHOT_TYPES = [
  "billing_divergence",
  "replay_divergence",
  "stale_lock_detected",
  "split_brain_detected",
  "clock_drift_detected",
  "duplicate_interval_detected",
  "orphan_active_call",
  "impossible_state_transition",
  "recovery_loop_detected",
  "event_order_violation",
];

const telecomChaosSnapshotSchema = new mongoose.Schema(
  {
    snapshotType: {
      type: String,
      enum: SNAPSHOT_TYPES,
      required: true,
      index: true,
    },
    callId: { type: mongoose.Schema.Types.ObjectId, ref: "Call", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    workerId: { type: String, default: null },
    hostname: { type: String, default: null },
    processId: { type: Number, default: null },
    economicVersion: { type: Number, default: null },
    callStateVersion: { type: String, default: null },
    timelineHash: { type: String, default: "" },
    journalHash: { type: String, default: "" },
    replayHash: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

telecomChaosSnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
telecomChaosSnapshotSchema.index({ callId: 1, createdAt: -1 });
telecomChaosSnapshotSchema.index({ snapshotType: 1, createdAt: -1 });

export const TELECOM_CHAOS_SNAPSHOT_TYPES = SNAPSHOT_TYPES;
export default mongoose.model("TelecomChaosSnapshot", telecomChaosSnapshotSchema);
