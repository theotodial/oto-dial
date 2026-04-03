import express from "express";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import {
  PRIMARY_ADMIN_EMAIL,
  getAdminRolesForUser,
  getAllAdminRoles
} from "../../constants/adminAccess.js";

const router = express.Router();

const PRIMARY_ADMIN_PASSWORD = "otodialteam";

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findUserByEmail = async (email) => {
  const escapedEmail = escapeRegex(email);
  return User.findOne({
    email: { $regex: new RegExp(`^${escapedEmail}$`, "i") }
  });
};

const isPasswordValid = async (inputPassword, storedPassword) => {
  if (!storedPassword) return false;

  if (inputPassword === storedPassword) {
    return true;
  }

  try {
    return await bcrypt.compare(inputPassword, storedPassword);
  } catch {
    return false;
  }
};

const buildAdminUserResponse = (user) => {
  const adminRoles = getAdminRolesForUser(user);
  const normalizedEmail = String(user.email || "").toLowerCase().trim();
  const isPrimaryAdmin = normalizedEmail === PRIMARY_ADMIN_EMAIL.toLowerCase();
  return {
    id: user._id,
    email: user.email,
    name: user.name || "Admin",
    role: user.role,
    adminRoles,
    allowedModules: adminRoles,
    isPrimaryAdmin
  };
};

/**
 * POST /api/admin/auth/login
 * Admin login (primary admin + team members)
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // Check JWT_SECRET is set
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not set in environment variables");
      return res.status(500).json({
        success: false,
        error: "Server configuration error"
      });
    }

    // Validate input
    if (!email || !password) {
      console.warn(`Admin login attempt with missing credentials from IP: ${clientIp}`);
      return res.status(400).json({
        success: false,
        error: "Email and password are required"
      });
    }

    // Validate credentials
    const normalizedEmail = email?.toLowerCase().trim();
    const trimmedPassword = password.trim();
    const isPrimaryLogin =
      normalizedEmail === PRIMARY_ADMIN_EMAIL.toLowerCase() &&
      trimmedPassword === PRIMARY_ADMIN_PASSWORD;

    let adminUser = await findUserByEmail(normalizedEmail);

    if (isPrimaryLogin) {
      if (!adminUser) {
        const hashedPassword = await bcrypt.hash(PRIMARY_ADMIN_PASSWORD, 10);
        adminUser = await User.create({
          email: PRIMARY_ADMIN_EMAIL,
          password: hashedPassword,
          role: "admin",
          status: "active",
          name: "OTO DIAL Admin",
          adminRoles: getAllAdminRoles()
        });
      } else {
        let requiresSave = false;

        if (adminUser.role !== "admin") {
          adminUser.role = "admin";
          requiresSave = true;
        }
        if (adminUser.status !== "active") {
          adminUser.status = "active";
          requiresSave = true;
        }
        if (!Array.isArray(adminUser.adminRoles) || adminUser.adminRoles.length === 0) {
          adminUser.adminRoles = getAllAdminRoles();
          requiresSave = true;
        }
        if (requiresSave) {
          await adminUser.save();
        }
      }
    } else {
      if (!adminUser || adminUser.role !== "admin") {
        console.warn(`Admin login denied for non-admin user: ${normalizedEmail} (${clientIp})`);
        return res.status(401).json({
          success: false,
          error: "Invalid admin credentials"
        });
      }

      if (adminUser.status !== "active") {
        return res.status(403).json({
          success: false,
          error: "Admin account is inactive"
        });
      }

      const passwordMatches = await isPasswordValid(trimmedPassword, adminUser.password);
      if (!passwordMatches) {
        return res.status(401).json({
          success: false,
          error: "Invalid admin credentials"
        });
      }
    }

    adminUser.lastAdminLoginAt = new Date();
    await adminUser.save();

    const adminRoles = getAdminRolesForUser(adminUser);
    if (adminRoles.length === 0) {
      return res.status(403).json({
        success: false,
        error: "No admin permissions assigned to this account"
      });
    }

    // Generate JWT token - works from any device/location
    const token = jwt.sign(
      { userId: adminUser._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // 7 days - allows login from multiple devices
    );

    console.log(`Admin login successful for: ${adminUser.email} from IP: ${clientIp} (${userAgent})`);

    res.json({
      success: true,
      token,
      user: buildAdminUserResponse(adminUser)
    });
  } catch (err) {
    console.error("Admin login error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      success: false,
      error: err.message || "Login failed. Please check server logs."
    });
  }
});

/**
 * GET /api/admin/auth/me
 * Get current admin user
 */
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("-password");

    if (!user || user.role !== "admin" || user.status !== "active") {
      return res.status(403).json({ success: false, error: "Admin access required" });
    }

    const adminRoles = getAdminRolesForUser(user);
    if (adminRoles.length === 0) {
      return res.status(403).json({ success: false, error: "No admin permissions assigned" });
    }

    res.json({
      success: true,
      user: buildAdminUserResponse(user)
    });
  } catch (err) {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

export default router;
