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
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    // HARDCODED ADMIN CREDENTIALS
    const ADMIN_EMAIL = "theotodial@gmail.com";
    const ADMIN_PASSWORD = "otodialteam";

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

    // Validate credentials - case insensitive email comparison, exact password match
    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedAdminEmail = ADMIN_EMAIL.toLowerCase().trim();
    const trimmedPassword = password.trim();
    
    const emailMatch = normalizedEmail === normalizedAdminEmail;
    const passwordMatch = trimmedPassword === ADMIN_PASSWORD;

    if (!emailMatch || !passwordMatch) {
      console.warn(`Admin login attempt failed - Email match: ${emailMatch}, Password match: ${passwordMatch}, IP: ${clientIp}, Email: ${email}`);
      return res.status(401).json({
        success: false,
        error: "Invalid admin credentials"
      });
    }

    console.log(`Admin login attempt from IP: ${clientIp}, User-Agent: ${userAgent}`);

    // Find or create admin user - case insensitive search
    let adminUser = await User.findOne({ 
      email: { $regex: new RegExp(`^${ADMIN_EMAIL}$`, 'i') }
    });

    if (!adminUser) {
      console.log("Creating new admin user in database");
      // Create admin user if doesn't exist
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      try {
        adminUser = await User.create({
          email: ADMIN_EMAIL,
          password: hashedPassword,
          role: "admin",
          status: "active",
          name: "OTO DIAL Admin"
        });
        console.log("Admin user created successfully");
      } catch (createError) {
        console.error("Error creating admin user:", createError);
        return res.status(500).json({
          success: false,
          error: "Failed to create admin user"
        });
      }
    } else {
      // Ensure user is admin and active
      let needsSave = false;
      if (adminUser.role !== "admin") {
        adminUser.role = "admin";
        needsSave = true;
      }
      if (adminUser.status !== "active") {
        adminUser.status = "active";
        needsSave = true;
      }
      if (needsSave) {
        await adminUser.save();
        console.log("Admin user updated");
      }
    }

    // Generate JWT token - works from any device/location
    const token = jwt.sign(
      { userId: adminUser._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // 7 days - allows login from multiple devices
    );

    console.log(`Admin login successful for: ${adminUser.email} from IP: ${clientIp}`);

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
