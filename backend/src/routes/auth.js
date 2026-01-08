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
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
