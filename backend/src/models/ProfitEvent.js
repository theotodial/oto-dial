import mongoose from "mongoose";

const profitEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      enum: [
        "profitability_user_calculated",
        "profit_negative_detected",
        "abuse_pattern_detected",
        "cost_spike_detected",
        "billing_drift_detected",
        "billing_timeline_corruption",
        "billing_stuck_detected",
        "billing_recovery_attempted",
        "orphan_reservation_detected",
        "economic_forensics_admin_recovery",
        "session_drift_detected",
        "stale_webrtc_session",
        "ghost_call_detected",
        "telecom_event_order_violation",
        "split_brain_detected",
        "clock_drift_detected",
        "economic_lock_starvation",
        "replay_divergence",
      ],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

profitEventSchema.index({ eventType: 1, timestamp: -1 });
profitEventSchema.index({ userId: 1, eventType: 1, timestamp: -1 });

export default mongoose.model("ProfitEvent", profitEventSchema);
