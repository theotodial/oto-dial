import mongoose from "mongoose";

const processedWebhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, index: true },
    eventId: { type: String, required: true },
    processedAt: { type: Date, default: Date.now, index: true },
    payloadHash: { type: String, required: true, index: true },
    eventType: { type: String, default: null, index: true },
    duplicateCount: { type: Number, default: 0 },
    lastDuplicateAt: { type: Date, default: null },
  },
  { timestamps: true }
);

processedWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
processedWebhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export default mongoose.model("ProcessedWebhookEvent", processedWebhookEventSchema);
