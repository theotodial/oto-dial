import express from "express";
import multer from "multer";
import User from "../models/User.js";
import bcrypt from "bcryptjs";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * GET /api/users/profile
 */
router.get("/profile", async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -sessions');
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        phone: user.phone,
        company: user.company,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error("GET /profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/users/me (alternative endpoint)
 */
router.get("/me", async (req, res) => {
  try {
    const subscription = req.subscription;
    const user = await User.findById(req.user._id).select('-password -sessions');

    return res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        phone: user.phone,
        company: user.company,
        role: user.role
      },
      subscription: subscription
        ? {
            active: true,
            plan: "monthly",
            minutesRemaining: subscription.minutesRemaining,
            smsRemaining: subscription.smsRemaining,
            number: subscription.numbers.length
              ? subscription.numbers[0].phoneNumber
              : null
          }
        : {
            active: false
          }
    });
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * PATCH /api/users/profile
 */
router.patch("/profile", async (req, res) => {
  try {
    const { firstName, lastName, name, phone, company } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (company !== undefined) user.company = company;

    await user.save();

    return res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        phone: user.phone,
        company: user.company,
        role: user.role
      }
    });
  } catch (err) {
    console.error("PATCH /profile error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/users/change-password
 */
router.post("/change-password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check current password (simple comparison for now, should use bcrypt in production)
    if (user.password !== currentPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return res.json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (err) {
    console.error("POST /change-password error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/users/verify
 * Accepts verification documents (stored externally in production)
 */
router.post("/verify", upload.single("document"), async (req, res) => {
  try {
    const { type } = req.body;

    if (!type) {
      return res.status(400).json({ error: "Verification type is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Document is required" });
    }

    console.log("📝 Verification upload:", {
      userId: req.userId,
      type,
      filename: req.file.originalname,
      size: req.file.size,
      receivedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: "Verification submitted"
    });
  } catch (err) {
    console.error("POST /verify error:", err);
    res.status(500).json({ error: "Failed to submit verification" });
  }
});

export default router;
