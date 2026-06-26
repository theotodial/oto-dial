import AnalyticsAuditLog from "../../models/analytics/AnalyticsAuditLog.js";

/**
 * Record a privileged analytics action. Best-effort; never throws.
 */
export async function logAnalyticsAction(req, action, details = {}) {
  try {
    const admin = req.user || {};
    await AnalyticsAuditLog.create({
      adminId: admin._id || admin.id || null,
      adminEmail: admin.email || null,
      action,
      details,
      ipAddress:
        (req.headers?.["x-forwarded-for"]
          ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
          : null) ||
        req.ip ||
        null,
      userAgent: req.headers?.["user-agent"] || null
    });
  } catch (error) {
    console.warn("[analytics] audit log failed:", error?.message || error);
  }
}

export default { logAnalyticsAction };
