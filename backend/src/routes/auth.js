import dotenv from "dotenv";
dotenv.config(); // 🚨 REQUIRED FOR ESM

import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

const router = express.Router();

/**
 * =========================================
 * Google OAuth
 * =========================================
 */
let googleOAuthEnabled = false;

if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_CALLBACK_URL
) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
      },
      async (_, __, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("No email from Google"), null);
          }

          let user = await User.findOne({ email });

          if (!user) {
            user = await User.create({
              email,
              password: "google-oauth",
              firstName: profile.name?.givenName || "",
              lastName: profile.name?.familyName || "",
              name: profile.displayName || "",
              status: "active"
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  googleOAuthEnabled = true;
  console.log("✅ Google OAuth enabled");
} else {
  console.warn("⚠️ Google OAuth disabled (env vars missing)");
}

/**
 * =========================================
 * Google OAuth Routes
 * =========================================
 */
router.get("/google", (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.status(503).json({ error: "Google OAuth not configured" });
  }

  passport.authenticate("google", {
    scope: ["email", "profile"],
    session: false
  })(req, res, next);
});

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const token = jwt.sign(
      { userId: req.user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.redirect(
      `${process.env.FRONTEND_URL}/oauth-success?token=${token}`
    );
  }
);

/**
 * =========================================
 * Email / Password Register
 * =========================================
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "User already exists"
      });
    }

    const user = await User.create({
      email,
      password,
      firstName: firstName || "",
      lastName: lastName || "",
      name: name || `${firstName || ""} ${lastName || ""}`.trim(),
      phone: phone || ""
    });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * =========================================
 * Email / Password Login
 * =========================================
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials"
      });
    }

    // Get device info
    const userAgent = req.get('user-agent') || 'Unknown Device';
    const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown IP';
    const deviceInfo = userAgent.includes('Mobile') ? 'Mobile Device' : 
                      userAgent.includes('Tablet') ? 'Tablet' : 
                      'Desktop/Web Browser';

    // Check for existing active sessions
    const existingSessions = user.sessions || [];
    const activeSessions = existingSessions.filter(s => {
      try {
        const decoded = jwt.verify(s.token, process.env.JWT_SECRET);
        return decoded.userId === user._id.toString();
      } catch {
        return false;
      }
    });

    // Generate new token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Add new session
    const newSession = {
      deviceInfo,
      userAgent,
      ipAddress,
      lastLogin: new Date(),
      token
    };

    // Keep only last 5 sessions, remove expired ones
    const validSessions = activeSessions.slice(-4); // Keep 4 previous + 1 new = 5 total
    user.sessions = [...validSessions, newSession];
    await user.save();

    // Prepare response with existing session info if any
    const existingSessionInfo = activeSessions.length > 0 ? {
      message: "You are already logged in on another device",
      existingSessions: activeSessions.map(s => ({
        device: s.deviceInfo,
        lastLogin: s.lastLogin,
        ipAddress: s.ipAddress
      }))
    } : null;

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      },
      ...(existingSessionInfo && { sessionInfo: existingSessionInfo })
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * =========================================
 * Forgot Password (stub)
 * =========================================
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email, redirectTo } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    console.log("🔐 Password reset requested:", {
      email,
      redirectTo,
      requestedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: "Password reset link sent"
    });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
