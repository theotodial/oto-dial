import express from "express";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { selfHealSubscriptionForUser } from "../services/stripeSubscriptionService.js";

const router = express.Router();

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
        businessType: user.businessType || "",
        country: user.country || "",
        timezone: user.timezone || "",
        language: user.language || "en",
        profilePicture: user.profilePicture || null,
        identityVerification: user.identityVerification || null,
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
    try {
      await selfHealSubscriptionForUser(req.user._id, "users_me");
    } catch (healErr) {
      console.warn(`⚠️ /users/me self-heal failed for ${req.user._id}:`, healErr.message);
    }

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
            plan: subscription.planType || "monthly",
            planType: subscription.planType || null,
            displayUnlimited: Boolean(subscription.displayUnlimited),
            minutesRemaining: subscription.displayUnlimited ? "∞" : subscription.minutesRemaining,
            smsRemaining: subscription.displayUnlimited ? "∞" : subscription.smsRemaining,
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
    const {
      firstName,
      lastName,
      name,
      phone,
      company,
      businessType,
      country,
      timezone,
      language,
    } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (company !== undefined) user.company = company;
    if (businessType !== undefined) user.businessType = businessType;
    if (country !== undefined) user.country = country;
    if (timezone !== undefined) user.timezone = timezone;
    if (language !== undefined) user.language = language;

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
        businessType: user.businessType || "",
        country: user.country || "",
        timezone: user.timezone || "",
        language: user.language || "en",
        profilePicture: user.profilePicture || null,
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

    const stored = user.password || "";
    const looksBcrypt = /^\$2[aby]\$\d{2}\$/.test(stored);
    let isPasswordValid = false;
    if (looksBcrypt) {
      isPasswordValid = await bcrypt.compare(currentPassword, stored);
    } else {
      isPasswordValid = currentPassword === stored;
    }
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash and update password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
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
 * DELETE /api/users/account
 */
router.delete("/account", async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password is required to delete account" });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const stored = user.password || "";
    const looksBcrypt = /^\$2[aby]\$\d{2}\$/.test(stored);
    const ok = looksBcrypt
      ? await bcrypt.compare(password, stored)
      : password === stored;
    if (!ok) {
      return res.status(401).json({ error: "Password is incorrect" });
    }

    // Delete user account
    await User.findByIdAndDelete(req.user._id);

    return res.json({
      success: true,
      message: "Account deleted successfully"
    });
  } catch (err) {
    console.error("DELETE /account error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/users/upload-profile-picture
 */
router.post("/upload-profile-picture", async (req, res) => {
  try {
    const { profilePicture } = req.body; // Base64 or URL
    
    if (!profilePicture) {
      return res.status(400).json({ error: "Profile picture is required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Save profile picture URL (in production, upload to cloud storage)
    user.profilePicture = profilePicture;
    await user.save();

    return res.json({
      success: true,
      url: profilePicture,
      message: "Profile picture updated successfully"
    });
  } catch (err) {
    console.error("POST /upload-profile-picture error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/users/upload-verification
 */
router.post("/upload-verification", async (req, res) => {
  try {
    const { idDocument, businessDocument, verificationType } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update verification documents
    if (idDocument) user.identityVerification.idDocument = idDocument;
    if (businessDocument) user.identityVerification.businessDocument = businessDocument;
    if (verificationType) user.identityVerification.verificationType = verificationType;
    
    user.identityVerification.status = "pending";
    user.identityVerification.submittedAt = new Date();
    
    await user.save();

    return res.json({
      success: true,
      message: "Verification documents submitted successfully"
    });
  } catch (err) {
    console.error("POST /upload-verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
