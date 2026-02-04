import express from "express";
import authenticateUser from "../../middleware/authenticateUser.js";
import AdminUser from "../../models/AdminUser.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const router = express.Router();

/**
 * GET /api/admin/team
 * List all admin users (ADMIN ONLY)
 */
router.get(
  "/",
  authenticateUser,
  async (req, res) => {
    try {
      // TODO: Check if user is super_admin or admin
      const admins = await AdminUser.find()
        .select("-password")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        admins
      });
    } catch (err) {
      console.error("Get admin team error:", err);
      res.status(500).json({ error: "Failed to fetch admin team" });
    }
  }
);

/**
 * POST /api/admin/team/invite
 * Invite new admin user (SUPER_ADMIN ONLY)
 */
router.post(
  "/invite",
  authenticateUser,
  async (req, res) => {
    try {
      // TODO: Check if user is super_admin
      const { email, name, role } = req.body;

      if (!email || !name || !role) {
        return res.status(400).json({ error: "Email, name, and role are required" });
      }

      // Check if admin already exists
      const existing = await AdminUser.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(400).json({ error: "Admin with this email already exists" });
      }

      // Generate temporary password
      const tempPassword = crypto.randomBytes(12).toString("hex");

      // Create admin user
      const admin = await AdminUser.create({
        email: email.toLowerCase(),
        name,
        role,
        password: tempPassword,
        createdBy: req.user._id,
        isActive: true
      });

      // TODO: Send invitation email with temp password

      res.json({
        success: true,
        message: "Admin user created successfully",
        admin: {
          _id: admin._id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          role: admin.role,
          tempPassword // Return temp password (should be sent via email in production)
        }
      });
    } catch (err) {
      console.error("Invite admin error:", err);
      res.status(500).json({ error: "Failed to invite admin" });
    }
  }
);

/**
 * PUT /api/admin/team/:id
 * Update admin user role/permissions (SUPER_ADMIN ONLY)
 */
router.put(
  "/:id",
  authenticateUser,
  async (req, res) => {
    try {
      // TODO: Check if user is super_admin
      const { role, isActive, permissions } = req.body;

      const admin = await AdminUser.findById(req.params.id);
      if (!admin) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      // Prevent self-modification of critical fields
      if (admin._id.toString() === req.user._id.toString() && role && role !== admin.role) {
        return res.status(400).json({ error: "Cannot change your own role" });
      }

      if (role) admin.role = role;
      if (typeof isActive === "boolean") admin.isActive = isActive;
      if (permissions) admin.permissions = { ...admin.permissions, ...permissions };

      await admin.save();

      res.json({
        success: true,
        message: "Admin user updated successfully",
        admin: {
          _id: admin._id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          isActive: admin.isActive,
          permissions: admin.permissions
        }
      });
    } catch (err) {
      console.error("Update admin error:", err);
      res.status(500).json({ error: "Failed to update admin" });
    }
  }
);

/**
 * DELETE /api/admin/team/:id
 * Deactivate admin user (SUPER_ADMIN ONLY)
 */
router.delete(
  "/:id",
  authenticateUser,
  async (req, res) => {
    try {
      // TODO: Check if user is super_admin
      const admin = await AdminUser.findById(req.params.id);
      if (!admin) {
        return res.status(404).json({ error: "Admin user not found" });
      }

      // Prevent self-deletion
      if (admin._id.toString() === req.user._id.toString()) {
        return res.status(400).json({ error: "Cannot deactivate your own account" });
      }

      admin.isActive = false;
      await admin.save();

      res.json({
        success: true,
        message: "Admin user deactivated successfully"
      });
    } catch (err) {
      console.error("Deactivate admin error:", err);
      res.status(500).json({ error: "Failed to deactivate admin" });
    }
  }
);

export default router;
