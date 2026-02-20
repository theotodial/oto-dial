import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import AdminNotification from "../../models/AdminNotification.js";

const router = express.Router();

router.get("/notifications", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const notifications = await AdminNotification.find()
      .sort({ createdAt: -1 })
      .limit(limit);

    const unreadCount = await AdminNotification.countDocuments({ isRead: false });

    return res.json({
      success: true,
      unreadCount,
      notifications
    });
  } catch (err) {
    console.error("ADMIN NOTIFICATIONS FETCH ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch notifications"
    });
  }
});

router.patch("/notifications/:id/read", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await AdminNotification.findByIdAndUpdate(
      id,
      {
        isRead: true,
        readAt: new Date()
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    return res.json({
      success: true,
      notification
    });
  } catch (err) {
    console.error("ADMIN NOTIFICATION READ ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to update notification"
    });
  }
});

router.patch("/notifications/read-all", requireAdmin, async (_req, res) => {
  try {
    await AdminNotification.updateMany(
      { isRead: false },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    return res.json({
      success: true
    });
  } catch (err) {
    console.error("ADMIN NOTIFICATION READ ALL ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to mark notifications as read"
    });
  }
});

export default router;
