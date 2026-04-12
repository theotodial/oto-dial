import crypto from "crypto";
import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { scheduleBackgroundSelfHeal } from "../services/stripeSubscriptionService.js";
import { cacheKeys, setCachedJson } from "../services/cache.service.js";
import {
  attachAffiliateReferralToUser,
  buildOAuthState,
  parseOAuthState
} from "../services/affiliateService.js";
import { sendEmailSafe } from "../services/email.service.js";
import {
  newDeviceEmail,
  passwordResetSuccessEmail,
  pricingEmail,
  resetPasswordEmail,
  verificationEmail,
  welcomeEmail
} from "../emails/templates.js";

const router = express.Router();

const EMAIL_VERIFY_TTL_MS = 15 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function generatePlainToken() {
  return crypto.randomBytes(32).toString("hex");
}

const BCRYPT_ROUNDS = 12;

async function hashUserPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** Supports legacy plain-text passwords and bcrypt hashes. */
async function verifyPassword(plain, stored) {
  if (!plain || !stored) return false;
  if (stored === "google-oauth") return false;
  if (typeof stored === "string" && /^\$2[aby]\$/.test(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

function trimBase(s) {
  return String(s || "").trim().replace(/\/+$/, "");
}

/** Where the browser should land after email verification (SPA origin). */
function postEmailVerificationRedirectBase() {
  const fe = trimBase(process.env.FRONTEND_URL);
  if (fe) return fe;
  const app = trimBase(process.env.APP_URL);
  if (app) return app;
  return "http://localhost:3000";
}

/**
 * Host + origin for links that must hit THIS Node API (not the static site).
 * Prefer BACKEND_URL when the app is on otodial.com and API is on api.otodial.com.
 * Otherwise FRONTEND_URL (Vite proxies /api → backend in dev) or APP_URL.
 */
function verificationLinkOrigin() {
  const backend = trimBase(process.env.BACKEND_URL);
  if (backend) return backend;
  const fe = trimBase(process.env.FRONTEND_URL);
  if (fe) return fe;
  const app = trimBase(process.env.APP_URL);
  if (app) return app;
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  console.warn(
    "⚠️ BACKEND_URL / FRONTEND_URL / APP_URL unset — verification links may 404. Set BACKEND_URL=https://api.yourdomain.com"
  );
  return "http://localhost:3000";
}

/** Legacy helper used by forgot-password (frontend-facing URLs). */
function publicFrontendBase() {
  return postEmailVerificationRedirectBase();
}

const VERIFICATION_EMAIL_COOLDOWN_MS = 45 * 1000;

const PRICING_ONBOARDING_EMAIL_DELAY_MS = (() => {
  const n = Number(process.env.PRICING_ONBOARDING_EMAIL_DELAY_MS ?? 120000);
  return Number.isFinite(n) && n >= 0 ? n : 120000;
})();

/**
 * One-time pricing email for users without an active subscription (non-blocking).
 */
function schedulePricingOnboardingEmail(userId) {
  if (!userId) return;
  setTimeout(async () => {
    try {
      const user = await User.findById(userId);
      if (!user?.email) return;
      if (user.pricingOnboardingEmailSentAt) return;
      if (user.subscriptionActive === true) return;

      const sent = await sendEmailSafe(
        {
          to: user.email,
          subject: "OTODIAL — choose your plan",
          html: pricingEmail({ name: user.name || user.firstName || "there" }),
          emailType: "pricing_onboarding",
          templateUsed: "pricingEmail"
        },
        "pricing_onboarding"
      );

      if (sent != null) {
        await User.updateOne(
          { _id: userId, pricingOnboardingEmailSentAt: null },
          { $set: { pricingOnboardingEmailSentAt: new Date() } }
        );
      }
    } catch (e) {
      console.error("Email failed [pricing_onboarding]:", e?.message || e);
    }
  }, PRICING_ONBOARDING_EMAIL_DELAY_MS);
}

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

function sendEmailInBackground(payload, contextLabel) {
  console.log(`📧 [background:${contextLabel}] scheduling send to`, payload?.to);
  sendEmailSafe(payload, contextLabel).then((result) => {
    if (result == null) {
      console.error(`❌ [background:${contextLabel}] email not sent (see logs above)`);
    } else {
      console.log(`✅ [background:${contextLabel}] finished`);
    }
  });
}

/**
 * Stores a hashed verification token, expiry (15m), updates lastVerificationEmailSentAt, sends email (awaited).
 * @returns {{ ok: true } | { ok: false, reason: 'cooldown' }}
 */
async function setEmailVerificationAndSend(user, options = {}) {
  const { respectCooldown = false, logResend = false } = options;

  if (respectCooldown && user.lastVerificationEmailSentAt) {
    const elapsed = Date.now() - new Date(user.lastVerificationEmailSentAt).getTime();
    if (elapsed < VERIFICATION_EMAIL_COOLDOWN_MS) {
      console.log(
        "📧 Verification send skipped (cooldown):",
        user.email,
        `(${(elapsed / 1000).toFixed(1)}s since last send)`
      );
      return { ok: false, reason: "cooldown" };
    }
  }

  const plainToken = generatePlainToken();
  user.emailVerificationToken = sha256Hex(plainToken);
  user.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
  await user.save();

  const origin = verificationLinkOrigin();
  const verification_link = `${origin}/api/auth/verify-email?token=${encodeURIComponent(plainToken)}`;
  if (logResend) {
    console.log("🔁 Resending verification email to:", user.email);
  }
  console.log("🚀 Sending verification email to:", user.email);
  console.log("📧 Verification link base:", `${origin}/api/auth/verify-email?token=(redacted)`);

  const sent = await sendEmailSafe(
    {
      to: user.email,
      subject: "Verify your OTODIAL email",
      html: verificationEmail({
        name: user.name || user.firstName || "there",
        link: verification_link
      }),
      emailType: "verification",
      templateUsed: "verificationEmail"
    },
    "verification"
  );

  if (sent == null) {
    return { ok: false, reason: "send_failed" };
  }

  user.lastVerificationEmailSentAt = new Date();
  await user.save();

  return { ok: true };
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
              status: "active",
              // Google already verified the email address
              isEmailVerified: true
            });

            sendEmailInBackground(
              {
                to: user.email,
                subject: "Welcome to OTODIAL 🚀",
                html: welcomeEmail({ name: user.name || "User" }),
                emailType: "welcome",
                templateUsed: "welcomeEmail"
              },
              "Google signup welcome"
            );
            schedulePricingOnboardingEmail(user._id);
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
 * Email verification (link in email → backend → redirect to app)
 * =========================================
 */
router.get("/verify-email", async (req, res) => {
  const tokenPlain = String(req.query.token || "").trim();
  const appBase = postEmailVerificationRedirectBase();
  const failRedirect = `${appBase}/login?verified=0`;
  const okRedirect = `${appBase}/dashboard?verified=1`;

  if (!tokenPlain) {
    return res.redirect(failRedirect);
  }

  try {
    const tokenHash = sha256Hex(tokenPlain);
    const user = await User.findOne({
      emailVerificationToken: tokenHash,
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.redirect(failRedirect);
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    sendEmailInBackground(
      {
        to: user.email,
        subject: "Welcome to OTODIAL 🚀",
        html: welcomeEmail({ name: user.name || user.firstName || "User" }),
        emailType: "welcome",
        templateUsed: "welcomeEmail"
      },
      "Post-verification welcome"
    );

    return res.redirect(okRedirect);
  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);
    return res.redirect(failRedirect);
  }
});

/**
 * =========================================
 * Resend verification email (45s cooldown)
 * =========================================
 */
router.post("/resend-verification", async (req, res) => {
  try {
    const emailRaw = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!emailRaw) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const user = await User.findOne({ email: emailRaw });
    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          "If an account exists for this email, a verification message may be sent."
      });
    }

    if (user.isEmailVerified === true) {
      return res.status(400).json({
        success: false,
        error: "This email is already verified."
      });
    }

    if (user.password === "google-oauth") {
      return res.status(400).json({
        success: false,
        error: "This account uses Google sign-in."
      });
    }

    if (user.isEmailVerified !== false) {
      return res.status(400).json({
        success: false,
        error: "This account does not require email verification."
      });
    }

    try {
      const vr = await setEmailVerificationAndSend(user, {
        respectCooldown: true,
        logResend: true
      });
      if (!vr.ok && vr.reason === "cooldown") {
        return res.status(429).json({
          success: false,
          error: "Please wait 45 seconds before requesting again"
        });
      }
      if (!vr.ok && vr.reason === "send_failed") {
        return res.status(503).json({
          success: false,
          error: "Failed to send verification email. Try again."
        });
      }
    } catch (sendErr) {
      console.error("❌ Resend verification send failed:", sendErr?.message || sendErr);
      if (sendErr?.stack) console.error(sendErr.stack);
      return res.status(503).json({
        success: false,
        error: "Failed to send verification email. Try again."
      });
    }

    return res.json({
      success: true,
      message: "Verification email sent again"
    });
  } catch (err) {
    console.error("RESEND VERIFICATION ERROR:", err);
    if (err?.stack) console.error(err.stack);
    return res.status(500).json({ success: false, error: "Server error" });
  }
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

    const hashedPassword = await hashUserPassword(password);
    const user = await User.create({
      email,
      password: hashedPassword,
      firstName: firstName || "",
      lastName: lastName || "",
      name: name || `${firstName || ""} ${lastName || ""}`.trim(),
      phone: phone || "",
      isEmailVerified: false
    });

    schedulePricingOnboardingEmail(user._id);

    if (affiliateCode) {
      try {
        await attachAffiliateReferralToUser({
          user,
          affiliateCode,
          source: "register"
        });
      } catch (refErr) {
        console.error(
          `❌ Failed to attach affiliate referral during registration for ${user.email}:`,
          refErr?.message || refErr
        );
        if (refErr?.stack) console.error(refErr.stack);
      }
    }

    let verificationEmailSent = false;
    try {
      const vr = await setEmailVerificationAndSend(user);
      verificationEmailSent = vr.ok === true;
    } catch (sendErr) {
      console.error("❌ Register verification email failed:", sendErr?.message || sendErr);
      if (sendErr?.stack) console.error(sendErr.stack);
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      requiresEmailVerification: true,
      verificationEmailSent,
      message: verificationEmailSent
        ? "Verification email sent. Check your inbox."
        : "Account created. If you did not receive an email, use Resend in the banner.",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        isEmailVerified: false
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

    const user = await User.findOne({ email }).select(
      "email password role name firstName isEmailVerified sessions status"
    );
    const passwordOk = user ? await verifyPassword(password, user.password) : false;
    if (!user || !passwordOk) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials"
      });
    }

    // Email not verified: still issue a session; the app shows a banner + resend.

    // Get device info
    const userAgent = req.get('user-agent') || 'Unknown Device';
    const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown IP';
    const deviceInfo = userAgent.includes('Mobile') ? 'Mobile Device' : 
                      userAgent.includes('Tablet') ? 'Tablet' : 
                      'Desktop/Web Browser';

    // Check for existing active sessions
    const existingSessions = user.sessions || [];
    const isNewDeviceLogin = !existingSessions.some((session) => {
      return session?.userAgent === userAgent && session?.ipAddress === ipAddress;
    });
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

    if (isNewDeviceLogin && user.email) {
      sendEmailInBackground(
        {
          to: user.email,
          subject: "New Login Detected",
          html: newDeviceEmail({
            name: user.name || user.firstName || "there",
            ip: ipAddress,
            device: userAgent
          }),
          emailType: "new_device",
          templateUsed: "newDeviceEmail"
        },
        "New device login"
      );
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

    const isEmailVerified =
      user.password === "google-oauth" ||
      user.isEmailVerified === true ||
      user.isEmailVerified === undefined;

    const authUserPayload = {
      id: user._id,
      _id: user._id,
      name: user.name || user.firstName || "",
      email: user.email,
      role: user.role,
      status: user.status,
      isEmailVerified
    };

    await setCachedJson(cacheKeys.userProfile(user._id), authUserPayload, 300);
    scheduleBackgroundSelfHeal(user._id, "login");

    res.json({
      success: true,
      token,
      user: authUserPayload,
      ...(existingSessionInfo && { sessionInfo: existingSessionInfo })
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * =========================================
 * Forgot / reset password
 * =========================================
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const emailRaw = String(req.body.email || "").trim().toLowerCase();

    if (!emailRaw) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Same response either way — do not reveal whether the email exists
    const user = await User.findOne({ email: emailRaw });
    if (user && user.password !== "google-oauth") {
      const plainToken = generatePlainToken();
      user.resetPasswordToken = sha256Hex(plainToken);
      user.resetPasswordExpires = new Date(Date.now() + RESET_PASSWORD_TTL_MS);
      await user.save();

      const resetBase = `${publicFrontendBase()}/reset-password`;
      const reset_link = `${resetBase}?token=${encodeURIComponent(plainToken)}`;

      console.log("📧 Sending password reset email to:", user.email);
      await sendEmailSafe(
        {
          to: user.email,
          subject: "Reset your OTODIAL password",
          html: resetPasswordEmail({
            name: user.name || user.firstName || "there",
            reset_link
          }),
          emailType: "password_reset",
          templateUsed: "resetPasswordEmail"
        },
        "password_reset"
      );
    }

    return res.json({
      success: true,
      message: "Password reset email sent"
    });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    if (err?.stack) console.error(err.stack);
    return res.json({
      success: true,
      message: "Password reset email sent"
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const tokenPlain = String(req.body.token || "").trim();
    const password = req.body.password;

    if (!tokenPlain || !password) {
      return res.status(400).json({ error: "Token and password required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const tokenHash = sha256Hex(tokenPlain);
    const user = await User.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset link" });
    }

    user.password = await hashUserPassword(password);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    sendEmailInBackground(
      {
        to: user.email,
        subject: "Your OTODIAL password was updated",
        html: passwordResetSuccessEmail({
          name: user.name || user.firstName || "there"
        }),
        emailType: "password_reset_success",
        templateUsed: "passwordResetSuccessEmail"
      },
      "password_reset_success"
    );

    return res.json({ success: true, message: "Password updated" });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
