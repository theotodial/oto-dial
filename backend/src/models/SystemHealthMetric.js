import mongoose from "mongoose";

const systemHealthMetricSchema = new mongoose.Schema(
  {
    smsDeliveryRate: { type: Number, default: null },
    smsFailureRate: { type: Number, default: null },
    callConnectRate: { type: Number, default: null },
    webhookLatency: { type: Number, default: null },
    abandonedRate: { type: Number, default: null },
    queueDepth: { type: Number, default: 0 },
    activeCalls: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

systemHealthMetricSchema.index({ timestamp: -1 });

export default mongoose.model("SystemHealthMetric", systemHealthMetricSchema);
