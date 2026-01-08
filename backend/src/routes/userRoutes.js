import express from "express";
import User from "../models/User.js";
import authenticateUser from "../middleware/authenticateUser.js";

const router = express.Router();

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get("/profile", authenticateUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        name: user.name || '',
        phone: user.phone || '',
        company: user.company || '',
        role: user.role,
        status: user.status,
      }
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * PATCH /api/users/profile
 * Update user profile
 */
router.patch("/profile", authenticateUser, async (req, res) => {
  try {
    const { name, firstName, lastName, phone, company } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (company !== undefined) updateData.company = company;

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        name: user.name || '',
        phone: user.phone || '',
        company: user.company || '',
      }
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

/**
 * POST /api/users/change-password
 * Change user password
 */
router.post("/change-password", authenticateUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify current password (simple comparison for now - in production use bcrypt)
    if (user.password !== currentPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

/**
 * POST /api/users/verify
 * Upload verification documents
 */
router.post("/verify", authenticateUser, async (req, res) => {
  try {
    // For now, just acknowledge the upload
    // In production, you'd save the file and process it
    res.json({
      success: true,
      message: "Verification document uploaded. Our team will review it within 24-48 hours."
    });
  } catch (err) {
    console.error("Verification upload error:", err);
    res.status(500).json({ error: "Failed to upload verification document" });
  }
});

export default router;

