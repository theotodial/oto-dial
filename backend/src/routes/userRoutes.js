import express from "express";
import multer from "multer";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { cacheKeys, deleteCachedKey } from "../services/cache.service.js";
import {
  buildPublicSubscriptionState,
  buildEffectiveUsage,
  loadUserSubscription,
} from "../services/subscriptionService.js";
import { normalizeFeatures } from "../utils/userFeatures.js";
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
        businessType: user.businessType || "",
        country: user.country || "",
        timezone: user.timezone || "",
        language: user.language || "en",
        profilePicture: user.profilePicture || null,
        identityVerification: user.identityVerification || null,
        role: user.role,
        status: user.status,
        isEmailVerified: user.isEmailVerified !== false,
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
    const userId = req.user._id;
    const [user, resolvedSubscription] = await Promise.all([
      User.findById(userId).select("_id name email isEmailVerified features preferences"),
      loadUserSubscription(userId),
    ]);

    const activityUsage = resolvedSubscription
      ? {
          smsUsed: resolvedSubscription.smsUsed ?? 0,
          minutesUsed: resolvedSubscription.minutesUsed ?? 0,
          secondsUsed: resolvedSubscription.usage?.minutesUsed ?? 0,
        }
      : null;

    const effective = buildEffectiveUsage({
      subscription: resolvedSubscription,
      activityUsage,
    });

    console.log("[USAGE DEBUG]", {
      userId: String(userId),
      subscription: resolvedSubscription
        ? {
            id: String(resolvedSubscription._id),
            status: resolvedSubscription.status,
            smsRemaining: resolvedSubscription.smsRemaining,
            minutesRemaining: resolvedSubscription.minutesRemaining,
          }
        : null,
      customPackage: resolvedSubscription?.customPackage
        ? {
            id: String(resolvedSubscription.customPackage._id),
            smsAllowed: Number(resolvedSubscription.customPackage.smsAllowed ?? 0),
            minutesAllowed: Number(resolvedSubscription.customPackage.minutesAllowed ?? 0),
          }
        : null,
      result: effective,
    });

    return res.json({
      success: true,
      user: {
        _id: user?._id || req.user._id,
        id: user?._id || req.user._id,
        name: user?.name || req.user.name || "",
        email: user?.email || req.user.email,
        isEmailVerified: user?.isEmailVerified !== false,
        features: normalizeFeatures(user || req.user),
        preferences: {
          campaignMode:
            (user || req.user)?.preferences?.campaignMode === "pro" ? "pro" : "lite",
        },
      },
      subscription: buildPublicSubscriptionState(resolvedSubscription),
      customPackage: resolvedSubscription?.customPackage || null,
      usage: effective,
    });
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * PATCH /api/users/preferences
 * Lightweight UI prefs (e.g. Campaign lite vs pro mode).
 */
router.patch("/preferences", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const mode = req.body?.campaignMode;
    if (mode !== undefined) {
      const m = String(mode).toLowerCase() === "pro" ? "pro" : "lite";
      if (!user.preferences || typeof user.preferences !== "object") {
        user.preferences = {};
      }
      user.preferences.campaignMode = m;
      user.markModified("preferences");
    }
    await user.save();
    await deleteCachedKey(cacheKeys.userProfile(req.user._id));
    const prefs = user.preferences || {};
    return res.json({
      success: true,
      preferences: {
        campaignMode: prefs.campaignMode === "pro" ? "pro" : "lite",
      },
    });
  } catch (err) {
    console.error("PATCH /users/preferences error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

const MAX_AUTO_REPLY_RULES = 24;

function sanitizeAutoReplyRules(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    out.push({
      keyword: String(r.keyword ?? "").slice(0, 80),
      response: String(r.response ?? "").slice(0, 1600),
      useAi: Boolean(r.useAi),
      aiPrompt: String(r.aiPrompt ?? "").slice(0, 500),
      isFallback: Boolean(r.isFallback),
    });
    if (out.length >= MAX_AUTO_REPLY_RULES) break;
  }
  return out;
}

/**
 * GET /api/users/messaging-automation
 */
router.get("/messaging-automation", async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("messagingAutomation").lean();
    const ma = user?.messagingAutomation || {};
    return res.json({
      success: true,
      messagingAutomation: {
        autoReplyEnabled: Boolean(ma.autoReplyEnabled),
        autoReplyRules: Array.isArray(ma.autoReplyRules) ? ma.autoReplyRules : [],
      },
    });
  } catch (err) {
    console.error("GET /users/messaging-automation error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * PATCH /api/users/messaging-automation
 */
router.patch("/messaging-automation", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    if (req.body?.autoReplyEnabled !== undefined) {
      user.messagingAutomation = user.messagingAutomation || {};
      user.messagingAutomation.autoReplyEnabled = Boolean(req.body.autoReplyEnabled);
    }
    if (req.body?.autoReplyRules !== undefined) {
      user.messagingAutomation = user.messagingAutomation || {};
      user.messagingAutomation.autoReplyRules = sanitizeAutoReplyRules(req.body.autoReplyRules);
    }
    user.markModified("messagingAutomation");
    await user.save();
    await deleteCachedKey(cacheKeys.userProfile(req.user._id));
    const ma = user.messagingAutomation || {};
    return res.json({
      success: true,
      messagingAutomation: {
        autoReplyEnabled: Boolean(ma.autoReplyEnabled),
        autoReplyRules: Array.isArray(ma.autoReplyRules) ? ma.autoReplyRules : [],
      },
    });
  } catch (err) {
    console.error("PATCH /users/messaging-automation error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
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
    await deleteCachedKey(cacheKeys.userProfile(req.user._id));

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
    await deleteCachedKey(cacheKeys.userProfile(req.user._id));

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
    await deleteCachedKey(cacheKeys.userProfile(req.user._id));

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
    await deleteCachedKey(cacheKeys.userProfile(req.user._id));

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
    await deleteCachedKey(cacheKeys.userProfile(req.user._id));

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
