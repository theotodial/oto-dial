import mongoose from "mongoose";

const PerformanceHealthSnapshotSchema = new mongoose.Schema(
  {
    capturedAt: { type: Date, default: Date.now, index: true },
    eventLoopLagMs: { type: Number, default: null },
    rssBytes: { type: Number, default: null },
    heapUsedBytes: { type: Number, default: null },
    heapTotalBytes: { type: Number, default: null },
    externalBytes: { type: Number, default: null },
    mongoPingMs: { type: Number, default: null },
    redisPingMs: { type: Number, default: null },
    webhookThroughput60s: { type: Number, default: null },
    transitionThroughput60s: { type: Number, default: null },
    activeSockets: { type: Number, default: null },
    activeCalls: { type: Number, default: null },
    billingWorkerActiveCallsHint: { type: Number, default: null },
    pressureScore: { type: Number, default: null },
    pressureLevel: { type: String, default: null },
    degradedMode: { type: String, default: null },
  },
  { collection: "performance_health_snapshots" }
);

export default mongoose.model("PerformanceHealthSnapshot", PerformanceHealthSnapshotSchema);
