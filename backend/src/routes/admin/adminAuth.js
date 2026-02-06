import express from "express";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import bcrypt from "bcryptjs";

const router = express.Router();

/**
 * POST /api/admin/auth/login
 * Admin-only login with hardcoded credentials
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // HARDCODED ADMIN CREDENTIALS
    const ADMIN_EMAIL = "theotodial@gmail.com";
    const ADMIN_PASSWORD = "otodialteam";

    // Validate credentials - case insensitive email comparison
    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedAdminEmail = ADMIN_EMAIL.toLowerCase().trim();
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required"
      });
    }

    if (normalizedEmail !== normalizedAdminEmail || password !== ADMIN_PASSWORD) {
      console.warn(`Admin login attempt failed for email: ${email}`);
      return res.status(401).json({
        success: false,
        error: "Invalid admin credentials"
      });
    }

    // Find or create admin user - case insensitive search
    let adminUser = await User.findOne({ 
      email: { $regex: new RegExp(`^${ADMIN_EMAIL}$`, 'i') }
    });

    if (!adminUser) {
      // Create admin user if doesn't exist
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      adminUser = await User.create({
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: "admin",
        status: "active",
        name: "OTO DIAL Admin"
      });
    } else {
      // Ensure user is admin and active
      if (adminUser.role !== "admin") {
        adminUser.role = "admin";
        await adminUser.save();
      }
      if (adminUser.status !== "active") {
        adminUser.status = "active";
        await adminUser.save();
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: adminUser._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: adminUser._id,
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      }
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({
      success: false,
      error: "Login failed"
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

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    res.status(401).json({ success: false, error: "Unauthorized" });
  }
});

export default router;
