import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "../../models/User.js";
import {
  PRIMARY_ADMIN_EMAIL,
  normalizeAdminRoles,
  getAdminRolesForUser
} from "../../constants/adminAccess.js";

const router = express.Router();
const MIN_PASSWORD_LENGTH = 8;

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildTeamMemberPayload = (admin) => ({
  _id: admin._id,
  email: admin.email,
  name: admin.name || "Admin",
  role: "admin",
  adminRoles: getAdminRolesForUser(admin),
  isActive: admin.status === "active",
  status: admin.status,
  lastLogin: admin.lastAdminLoginAt || null,
  createdAt: admin.createdAt,
  createdBy: admin.adminCreatedBy
    ? {
        id: admin.adminCreatedBy._id,
        email: admin.adminCreatedBy.email,
        name: admin.adminCreatedBy.name
      }
    : null
});

const resolveAdminRolesFromRequest = (roles) => {
  const normalized = normalizeAdminRoles(roles);
  if (normalized.length === 0) {
    return null;
  }
  return normalized;
};

const generateTemporaryPassword = () => crypto.randomBytes(12).toString("hex");

const hasTeamManagementAccess = (adminUser) => {
  const roles = getAdminRolesForUser(adminUser);
  return roles.includes("team");
};

router.use((req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  if (!hasTeamManagementAccess(req.user)) {
    return res.status(403).json({ error: "Team management access required" });
  }

  return next();
});

/**
 * GET /api/admin/team
 * List all admin team users
 */
router.get("/", async (req, res) => {
  try {
    const admins = await User.find({ role: "admin" })
      .select("email name status adminRoles adminCreatedBy lastAdminLoginAt createdAt")
      .populate("adminCreatedBy", "name email")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      admins: admins.map(buildTeamMemberPayload)
    });
  } catch (err) {
    console.error("Get admin team error:", err);
    res.status(500).json({ error: "Failed to fetch admin team" });
  }
});

const createTeamMember = async (req, res) => {
  try {
    const { email, name, password, roles, isActive = true } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: "Email and name are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedRoles = resolveAdminRolesFromRequest(roles);

    if (!normalizedRoles) {
      return res.status(400).json({ error: "At least one valid team role is required" });
    }

    const existing = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i") }
    });
    if (existing) {
      return res.status(400).json({ error: "A user with this email already exists" });
    }

    const providedPassword = String(password || "").trim();
    const tempPassword = providedPassword || generateTemporaryPassword();
    if (tempPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      });
    }

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const admin = await User.create({
      email: normalizedEmail,
      name: String(name || "").trim(),
      password: hashedPassword,
      role: "admin",
      status: isActive ? "active" : "suspended",
      adminRoles: normalizedRoles,
      adminCreatedBy: req.user._id
    });

    const hydratedAdmin = await User.findById(admin._id)
      .select("email name status adminRoles adminCreatedBy lastAdminLoginAt createdAt")
      .populate("adminCreatedBy", "name email");

    return res.json({
      success: true,
      message: "Team user created successfully",
      admin: buildTeamMemberPayload(hydratedAdmin),
      tempPassword: providedPassword ? null : tempPassword
    });
  } catch (err) {
    console.error("Create team member error:", err);
    return res.status(500).json({ error: "Failed to create team user" });
  }
};

router.post("/", createTeamMember);
router.post("/invite", createTeamMember);

/**
 * PUT /api/admin/team/:id
 * Update team member (name, email, password, roles, status)
 */
router.put("/:id", async (req, res) => {
  try {
    const { name, email, newPassword, roles, isActive, status } = req.body;

    const admin = await User.findById(req.params.id);
    if (!admin || admin.role !== "admin") {
      return res.status(404).json({ error: "Team user not found" });
    }

    const isSelf = admin._id.toString() === req.user._id.toString();
    const isPrimaryAdmin =
      String(admin.email || "").toLowerCase().trim() === PRIMARY_ADMIN_EMAIL;

    if (isSelf && (isActive === false || status === "suspended" || status === "banned")) {
      return res.status(400).json({ error: "You cannot deactivate your own admin account" });
    }

    if (typeof name === "string") {
      admin.name = name.trim();
    }

    if (typeof email === "string" && email.trim()) {
      const normalizedEmail = email.toLowerCase().trim();
      if (isPrimaryAdmin && normalizedEmail !== PRIMARY_ADMIN_EMAIL) {
        return res.status(400).json({ error: "Primary admin email cannot be changed" });
      }
      const existing = await User.findOne({
        _id: { $ne: admin._id },
        email: { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i") }
      });
      if (existing) {
        return res.status(400).json({ error: "Another account already uses this email" });
      }
      admin.email = normalizedEmail;
    }

    if (roles !== undefined) {
      const normalizedRoles = resolveAdminRolesFromRequest(roles);
      if (!normalizedRoles) {
        return res.status(400).json({ error: "At least one valid team role is required" });
      }
      admin.adminRoles = normalizedRoles;
    }

    if (typeof newPassword === "string" && newPassword.trim()) {
      const trimmedPassword = newPassword.trim();
      if (trimmedPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
        });
      }
      admin.password = await bcrypt.hash(trimmedPassword, 10);
    }

    if (typeof isActive === "boolean") {
      admin.status = isActive ? "active" : "suspended";
    } else if (typeof status === "string" && ["active", "suspended", "banned"].includes(status)) {
      admin.status = status;
    }

    await admin.save();

    const refreshedAdmin = await User.findById(admin._id)
      .select("email name status adminRoles adminCreatedBy lastAdminLoginAt createdAt")
      .populate("adminCreatedBy", "name email");

    return res.json({
      success: true,
      message: "Team user updated successfully",
      admin: buildTeamMemberPayload(refreshedAdmin)
    });
  } catch (err) {
    console.error("Update team member error:", err);
    return res.status(500).json({ error: "Failed to update team user" });
  }
});

/**
 * DELETE /api/admin/team/:id
 * Deactivate team member
 */
router.delete("/:id", async (req, res) => {
  try {
    const admin = await User.findById(req.params.id);
    if (!admin || admin.role !== "admin") {
      return res.status(404).json({ error: "Team user not found" });
    }

    if (admin._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    const isPrimaryAdmin =
      String(admin.email || "").toLowerCase().trim() === PRIMARY_ADMIN_EMAIL;
    if (isPrimaryAdmin) {
      return res.status(400).json({ error: "Primary admin account cannot be deactivated" });
    }

    admin.status = "suspended";
    await admin.save();

    return res.json({
      success: true,
      message: "Team user deactivated successfully"
    });
  } catch (err) {
    console.error("Deactivate team member error:", err);
    return res.status(500).json({ error: "Failed to deactivate team user" });
  }
});

export default router;
