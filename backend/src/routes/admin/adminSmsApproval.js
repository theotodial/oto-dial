import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import {
  approvePendingSms,
  listPendingSmsForApproval,
  rejectPendingSms,
} from "../../services/smsModerationAdminService.js";

const router = express.Router();

/**
 * GET /api/admin/sms/approval
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { userId, search, startDate, endDate, page, limit } = req.query;
    const { rows, pagination } = await listPendingSmsForApproval({
      userId,
      search,
      startDate,
      endDate,
      page,
      limit,
    });

    res.json({
      success: true,
      items: rows.map((sms) => ({
        id: sms._id,
        userId: sms.user?._id || sms.user,
        userEmail: sms.user?.email,
        userName: sms.user?.name,
        from: sms.from,
        to: sms.to,
        body: sms.body,
        status: sms.status,
        moderationStatus: sms.moderationStatus,
        smsCostInfo: sms.smsCostInfo || null,
        createdAt: sms.createdAt,
        campaign: sms.campaign || null,
      })),
      pagination,
    });
  } catch (err) {
    console.error("GET /api/admin/sms/approval:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to list pending SMS" });
  }
});

/**
 * POST /api/admin/sms/approval/:id/approve
 */
router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const result = await approvePendingSms(req.params.id, req.user._id);
    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error || "Approve failed",
      });
    }
    res.json({ success: true, message: "SMS approved and queued for delivery" });
  } catch (err) {
    console.error("POST approve SMS moderation:", err);
    res.status(500).json({ success: false, error: err.message || "Approve failed" });
  }
});

/**
 * POST /api/admin/sms/approval/:id/reject
 */
router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    const result = await rejectPendingSms(req.params.id, req.user._id, reason);
    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        error: result.error || "Reject failed",
      });
    }
    res.json({ success: true, message: "SMS rejected (user-facing status unchanged)" });
  } catch (err) {
    console.error("POST reject SMS moderation:", err);
    res.status(500).json({ success: false, error: err.message || "Reject failed" });
  }
});

export default router;
