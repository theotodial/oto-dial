import mongoose from "mongoose";

/**
 * AnalyticsAuditLog
 *
 * Records privileged analytics actions (dashboard refreshes, exports,
 * filter changes, report generation) for compliance / forensics.
 */
const analyticsAuditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    adminEmail: { type: String, default: null },

    action: {
      type: String,
      enum: [
        "refresh",
        "export",
        "filter_change",
        "report_generation",
        "view",
        "live_visitor_view"
      ],
      required: true,
      index: true
    },

    details: { type: mongoose.Schema.Types.Mixed, default: {} },

    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null }
  },
  { timestamps: true }
);

analyticsAuditLogSchema.index({ createdAt: -1 });
analyticsAuditLogSchema.index({ adminId: 1, createdAt: -1 });

export default mongoose.model("AnalyticsAuditLog", analyticsAuditLogSchema);
