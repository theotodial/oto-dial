import dotenv from "dotenv";
dotenv.config(); // 🚨 REQUIRED FOR ESM

import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { selfHealSubscriptionForUser } from "../services/stripeSubscriptionService.js";
import {
  attachAffiliateReferralToUser,
  buildOAuthState,
  parseOAuthState
} from "../services/affiliateService.js";

const router = express.Router();

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
const GOOGLE_CALLBACK_URL = (
  process.env.GOOGLE_CALLBACK_URL ||
  process.env.GOOGLE_REDIRECT_URI ||
  process.env.GOOGLE_OAUTH_CALLBACK_URL ||
  (process.env.BACKEND_URL ? `${process.env.BACKEND_URL.replace(/\/+$/, "")}/api/auth/google/callback` : "")
).trim();

function resolveFrontendUrl(req) {
  const configuredUrl = (process.env.FRONTEND_URL || process.env.APP_URL || "").trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const originHeader = req.get("origin");
  if (originHeader && /^https?:\/\//i.test(originHeader)) {
    return originHeader.replace(/\/+$/, "");
  }

  const host = req.get("host");
  if (host) {
    return `${req.protocol}://${host}`;
  }

  return "http://localhost:5173";
}

function buildFrontendErrorRedirect(req, message, path = "/login") {
  const frontendUrl = resolveFrontendUrl(req);
  return `${frontendUrl}${path}?oauth_error=${encodeURIComponent(message)}`;
}

/**
 * =========================================
 * Google OAuth
 * =========================================
 */
let googleOAuthEnabled = false;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_CALLBACK_URL) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL
      },
      async (_, __, profile, done) => {
        try {
          const email = (profile.emails?.[0]?.value || "").trim().toLowerCase();
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
  console.log(`🔐 Google callback URL: ${GOOGLE_CALLBACK_URL}`);
} else {
  console.warn(
    "⚠️ Google OAuth disabled (missing client ID/secret/callback URL)"
  );
}

/**
 * =========================================
 * Google OAuth Routes
 * =========================================
 */
router.get("/google/status", (_req, res) => {
  res.json({
    success: true,
    googleOAuthEnabled,
    config: {
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      callbackUrl: GOOGLE_CALLBACK_URL || null
    }
  });
});

router.get("/google", (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.redirect(
      buildFrontendErrorRedirect(req, "Google sign-in is not configured yet.")
    );
  }

  const affiliateCode = String(req.query.affiliateCode || "")
    .trim()
    .toUpperCase();
  const statePayload = affiliateCode ? { affiliateCode } : {};
  const oauthState = Object.keys(statePayload).length
    ? buildOAuthState(statePayload)
    : null;

  passport.authenticate("google", {
    scope: ["email", "profile"],
    session: false,
    prompt: "select_account",
    ...(oauthState ? { state: oauthState } : {})
  })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  if (!googleOAuthEnabled) {
    return res.redirect(
      buildFrontendErrorRedirect(req, "Google sign-in is not configured yet.")
    );
  }

  return passport.authenticate("google", { session: false }, (authErr, user) => {
    if (authErr || !user?._id) {
      console.error("GOOGLE OAUTH ERROR:", authErr?.message || "No user returned");
      return res.redirect(
        buildFrontendErrorRedirect(
          req,
          "Google authentication failed. Please try again."
        )
      );
    }

    const oauthState = parseOAuthState(req.query.state);
    if (oauthState?.affiliateCode) {
      attachAffiliateReferralToUser({
        user,
        affiliateCode: oauthState.affiliateCode,
        source: "google_oauth"
      }).catch((refErr) => {
        console.warn(
          `⚠️ Failed to link affiliate referral for Google signup user ${user._id}:`,
          refErr.message
        );
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const frontendUrl = resolveFrontendUrl(req);
    res.redirect(
      `${frontendUrl}/oauth-success?token=${encodeURIComponent(token)}`
    );
  })(req, res, next);
});

/**
 * =========================================
 * Email / Password Register
 * =========================================
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, phone, affiliateCode } = req.body;

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

    if (affiliateCode) {
      try {
        await attachAffiliateReferralToUser({
          user,
          affiliateCode,
          source: "register"
        });
      } catch (refErr) {
        console.warn(
          `⚠️ Failed to attach affiliate referral during registration for ${user.email}:`,
          refErr.message
        );
      }
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

    // Keep a healthy session history so users can stay logged in on multiple devices.
    const maxTrackedSessionsRaw = Number(process.env.MAX_TRACKED_SESSIONS || 20);
    const maxTrackedSessions =
      Number.isFinite(maxTrackedSessionsRaw) && maxTrackedSessionsRaw > 1
        ? Math.floor(maxTrackedSessionsRaw)
        : 20;
    const validSessions = activeSessions.slice(-(maxTrackedSessions - 1));
    user.sessions = [...validSessions, newSession];
    await user.save();

    // Self-heal subscription linkage on login to avoid paid-but-inactive states.
    try {
      await selfHealSubscriptionForUser(user._id, "login");
    } catch (healErr) {
      console.warn(`⚠️ Login self-heal skipped for user ${user._id}:`, healErr.message);
    }

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

export default router;
