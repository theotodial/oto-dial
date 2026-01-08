import express from "express";
import User from "../../models/User.js";
import Call from "../../models/Call.js";
import requireAdmin from "../../middleware/requireAdmin.js";
import callExportRoutes from "./callExport.js";
import statsRoutes from "./statsRoutes.js";

const router = express.Router();

router.use(statsRoutes);
router.use(callExportRoutes);
/**
 * GET /api/admin/users
 * Admin: View all users
 */
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password");

    res.json({
      success: true,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch users"
    });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Admin: Suspend / Activate / Ban user
 */
router.patch("/users/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    // Allowed statuses
    if (!["active", "suspended", "banned"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value"
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update user status"
    });
  }
});

/**
 * GET /api/admin/calls
 * Admin: View all calls
 */
router.get("/calls", requireAdmin, async (req, res) => {
  try {
    const calls = await Call.find()
      .populate("user", "email role")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      calls
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch calls"
    });
  }
});


/**
 * GET /api/admin/usage
 * Admin: Platform usage summary
 */
router.get("/usage", requireAdmin, async (req, res) => {
  try {
    const users = await User.find();

    let totalMinutes = 0;
    let totalSms = 0;

    users.forEach(user => {
      totalMinutes += user.minutesUsed || 0;
      totalSms += user.smsUsed || 0;
    });

    res.json({
      success: true,
      totals: {
        totalUsers: users.length,
        minutesUsed: totalMinutes,
        smsUsed: totalSms
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch usage data"
    });
  }
});

export default router;
