import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import User from "../../models/User.js";

const router = express.Router();

/**
 * PATCH /api/admin/users/:id/name
 * Change user name
 */
router.patch("/:id/name", requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Name is required"
      });
    }

    const nameParts = name.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { 
        name,
        firstName,
        lastName
      },
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
      message: "User name updated",
      user
    });
  } catch (err) {
    console.error("Update user name error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update user name"
    });
  }
});

export default router;
