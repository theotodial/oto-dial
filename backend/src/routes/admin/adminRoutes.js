import express from "express";
import User from "../../models/User.js";
import Call from "../../models/Call.js";
import Subscription from "../../models/Subscription.js";
import requireAdmin from "../../middleware/requireAdmin.js";
import statsRoutes from "./statsRoutes.js";

const router = express.Router();

// Admin stats only
router.use(statsRoutes);

/**
 * GET /api/admin/users
 */
router.get("/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password");

    res.json({
      success: true,
      users
    });
  } catch {
    res.status(500).json({
      success: false,
      error: "Failed to fetch users"
    });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 */
router.patch("/users/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;

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
  } catch {
    res.status(500).json({
      success: false,
      error: "Failed to update user status"
    });
  }
});

/**
 * GET /api/admin/calls
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
  } catch {
    res.status(500).json({
      success: false,
      error: "Failed to fetch calls"
    });
  }
});

/**
 * GET /api/admin/usage
 * Uses Subscription collection as single source of truth
 */
router.get("/usage", requireAdmin, async (req, res) => {
  try {
    const users = await User.find();
    
    // Aggregate usage from Subscription (single source of truth)
    const subscriptions = await Subscription.find({ status: "active" });
    
    let totalSeconds = 0;
    let totalSms = 0;

    subscriptions.forEach(sub => {
      // minutesUsed field stores SECONDS internally
      const secondsUsed = sub.usage?.minutesUsed || 0;
      totalSeconds += secondsUsed;
      totalSms += sub.usage?.smsUsed || 0;
    });

    // Convert seconds to minutes for display (with decimals)
    const totalMinutes = totalSeconds / 60;

    res.json({
      success: true,
      totals: {
        totalUsers: users.length,
        totalActiveSubscriptions: subscriptions.length,
        minutesUsed: parseFloat(totalMinutes.toFixed(2)),
        smsUsed: totalSms
      }
    });
  } catch (err) {
    console.error("Admin usage error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch usage data"
    });
  }
});

export default router;
