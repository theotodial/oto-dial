import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import AdminLog from "../../models/AdminLog.js";
import User from "../../models/User.js";
import CustomPackage from "../../models/CustomPackage.js";
import { clearAdminUsersCache } from "../../services/adminUsersCacheService.js";
import { invalidateUserSubscriptionCache } from "../../services/subscriptionService.js";
import { sanitizeCustomPackageInput } from "../../services/customPackageService.js";

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
    clearAdminUsersCache();
  } catch (err) {
    console.error("Update user name error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update user name"
    });
  }
});

router.patch("/:id/email", requireAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    const existing = await User.findOne({ email, _id: { $ne: req.params.id } }).lean();
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Email is already in use"
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { email },
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
      message: "User email updated",
      user
    });
    clearAdminUsersCache();
  } catch (err) {
    console.error("Update user email error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update user email"
    });
  }
});

router.patch("/:id/password", requireAdmin, async (req, res) => {
  try {
    const password = String(req.body.password || "");
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters"
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    user.password = password;
    await user.save();

    res.json({
      success: true,
      message: "User password updated"
    });
    clearAdminUsersCache();
  } catch (err) {
    console.error("Update user password error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update user password"
    });
  }
});

router.patch("/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended", "banned"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status"
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
      message: "User status updated",
      user
    });
    clearAdminUsersCache();
  } catch (err) {
    console.error("Update user status error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update user status"
    });
  }
});

router.post("/:id/verify-email", requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
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
      message: "Email verification marked complete",
      user
    });
    clearAdminUsersCache();
  } catch (err) {
    console.error("Verify email admin error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to verify email"
    });
  }
});

router.post("/:id/adjust-usage", requireAdmin, async (req, res) => {
  return res.status(400).json({
    success: false,
    error:
      "Usage is derived from SMS and Call records only; subscription.usage is no longer writable. Correct source data or adjust plan limits instead.",
  });
});

router.put("/:id/custom-package", requireAdmin, async (req, res) => {
  try {
    const payload = sanitizeCustomPackageInput(req.body);
    const customPackage = await CustomPackage.findOneAndUpdate(
      { userId: req.params.id },
      {
        $set: {
          smsAllowed: payload.smsAllowed ?? 0,
          minutesAllowed: payload.minutesAllowed ?? 0,
          isSmsEnabled: payload.isSmsEnabled ?? true,
          isCallEnabled: payload.isCallEnabled ?? true,
          expiresAt: payload.expiresAt || null,
          allowedCountries: payload.allowedCountries || [],
          blockedCountries: payload.blockedCountries || [],
          overridePlan: payload.overridePlan !== false,
          active: payload.active !== false,
          notes: payload.notes || "",
          createdBy: req.user._id,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: req.params.id,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    console.log("[ADMIN] CustomPackage saved:", customPackage);
    await AdminLog.create({
      adminId: req.user._id,
      userId: req.params.id,
      action: "CUSTOM_PACKAGE_UPDATE",
      payload,
    });
    await invalidateUserSubscriptionCache(req.params.id);

    res.json({
      success: true,
      message: "Custom package saved",
      customPackage
    });
    clearAdminUsersCache();
  } catch (err) {
    console.error("Save custom package error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to save custom package"
    });
  }
});

router.delete("/:id/custom-package", requireAdmin, async (req, res) => {
  try {
    await CustomPackage.findOneAndUpdate(
      { userId: req.params.id },
      {
        $set: {
          active: false,
          updatedAt: new Date(),
        }
      },
      { new: true }
    );

    await AdminLog.create({
      adminId: req.user._id,
      userId: req.params.id,
      action: "CUSTOM_PACKAGE_CLEAR",
      payload: {},
    });
    await invalidateUserSubscriptionCache(req.params.id);

    res.json({
      success: true,
      message: "Custom package cleared"
    });
    clearAdminUsersCache();
  } catch (err) {
    console.error("Clear custom package error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to clear custom package"
    });
  }
});

export default router;
