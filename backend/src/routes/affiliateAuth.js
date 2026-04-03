import express from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import Affiliate from "../models/Affiliate.js";
import User from "../models/User.js";
import {
  buildOAuthState,
  generateAffiliateCode,
  parseOAuthState,
  resolveFrontendUrl
} from "../services/affiliateService.js";
import { createAdminNotification } from "../services/adminNotificationService.js";

const router = express.Router();

const GOOGLE_CLIENT_ID = (
  process.env.GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_OAUTH_CLIENT_ID ||
  ""
).trim();
const GOOGLE_CLIENT_SECRET = (
  process.env.GOOGLE_CLIENT_SECRET ||
  process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
  ""
).trim();
const hasGoogleOAuth = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

function buildFrontendRedirect(req, path) {
  const frontendUrl = resolveFrontendUrl(req);
  return `${frontendUrl}${path}`;
}

function buildAffiliateToken(affiliateId) {
  return jwt.sign({ affiliateId, scope: "affiliate" }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
}

async function createAffiliateApprovalNotification(affiliate) {
  return createAdminNotification({
    type: "affiliate_approval_request",
    title: "New affiliate approval request",
    message: `${affiliate.email} requested affiliate access`,
    sourceModel: "Affiliate",
    sourceId: affiliate._id,
    dedupeKey: `affiliate_approval_request:${affiliate._id}`,
    data: {
      affiliateId: affiliate._id.toString(),
      email: affiliate.email,
      name: affiliate.name || `${affiliate.firstName || ""} ${affiliate.lastName || ""}`.trim()
    }
  });
}

async function generateUniqueAffiliateCode() {
  for (let i = 0; i < 8; i += 1) {
    const candidate = generateAffiliateCode();
    const exists = await Affiliate.findOne({ affiliateCode: candidate }).lean();
    if (!exists) {
      return candidate;
    }
  }
  return `${generateAffiliateCode("AFFX")}${Date.now().toString(16).slice(-4).toUpperCase()}`;
}

router.get("/google/status", (_req, res) => {
  res.json({
    success: true,
    googleOAuthEnabled: hasGoogleOAuth
  });
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, phone } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required"
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await Affiliate.findOne({ email: normalizedEmail });

    if (existing) {
      if (existing.status === "approved") {
        return res.status(400).json({
          success: false,
          error: "Affiliate account already approved. Please login."
        });
      }

      if (existing.status === "pending") {
        return res.json({
          success: true,
          pendingApproval: true,
          message:
            "Account created successfully. Please wait for review and approval."
        });
      }

      return res.status(400).json({
        success: false,
        error:
          "Affiliate account already exists but is not approved. Please contact support."
      });
    }

    const affiliate = await Affiliate.create({
      email: normalizedEmail,
      password,
      firstName: firstName || "",
      lastName: lastName || "",
      name: name || `${firstName || ""} ${lastName || ""}`.trim(),
      phone: phone || "",
      status: "pending",
      affiliateCode: await generateUniqueAffiliateCode()
    });

    await createAffiliateApprovalNotification(affiliate);

    return res.json({
      success: true,
      pendingApproval: true,
      message: "Account created successfully. Please wait for review and approval."
    });
  } catch (err) {
    console.error("AFFILIATE REGISTER ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required"
      });
    }

    const affiliate = await Affiliate.findOne({
      email: String(email).trim().toLowerCase()
    });

    if (!affiliate || affiliate.password !== password) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials"
      });
    }

    if (affiliate.status !== "approved") {
      return res.status(403).json({
        success: false,
        pendingApproval: affiliate.status === "pending",
        error:
          affiliate.status === "pending"
            ? "Account created successfully. Please wait for review and approval."
            : "Affiliate account is not approved. Please contact support."
      });
    }

    affiliate.lastLoginAt = new Date();
    await affiliate.save();

    const token = buildAffiliateToken(affiliate._id);
    return res.json({
      success: true,
      token,
      affiliate: {
        id: affiliate._id,
        email: affiliate.email,
        name: affiliate.name,
        affiliateCode: affiliate.affiliateCode,
        status: affiliate.status
      }
    });
  } catch (err) {
    console.error("AFFILIATE LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Server error"
    });
  }
});

router.get("/google", (req, res, next) => {
  if (!hasGoogleOAuth) {
    return res.redirect(
      buildFrontendRedirect(
        req,
        "/affiliate/login?oauth_error=Google%20sign-in%20is%20not%20configured."
      )
    );
  }

  const callbackURL =
    process.env.AFFILIATE_GOOGLE_CALLBACK_URL ||
    (process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL.replace(/\/+$/, "")}/api/affiliate/auth/google/callback`
      : `${req.protocol}://${req.get("host")}/api/affiliate/auth/google/callback`);

  const state = buildOAuthState({ mode: "affiliate" });

  return passport.authenticate("google", {
    scope: ["email", "profile"],
    session: false,
    prompt: "select_account",
    callbackURL,
    state
  })(req, res, next);
});

router.get("/google/callback", (req, res, next) => {
  if (!hasGoogleOAuth) {
    return res.redirect(
      buildFrontendRedirect(
        req,
        "/affiliate/login?oauth_error=Google%20sign-in%20is%20not%20configured."
      )
    );
  }

  const callbackURL =
    process.env.AFFILIATE_GOOGLE_CALLBACK_URL ||
    (process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL.replace(/\/+$/, "")}/api/affiliate/auth/google/callback`
      : `${req.protocol}://${req.get("host")}/api/affiliate/auth/google/callback`);

  return passport.authenticate(
    "google",
    { session: false, callbackURL },
    async (authErr, googleUser) => {
      if (authErr || !googleUser?._id) {
        console.error(
          "AFFILIATE GOOGLE OAUTH ERROR:",
          authErr?.message || "No user returned"
        );
        return res.redirect(
          buildFrontendRedirect(
            req,
            "/affiliate/login?oauth_error=Google%20authentication%20failed"
          )
        );
      }

      const state = parseOAuthState(req.query.state);
      if (state.mode && state.mode !== "affiliate") {
        return res.redirect(
          buildFrontendRedirect(req, "/affiliate/login?oauth_error=Invalid%20OAuth%20state")
        );
      }

      const userRecord = await User.findById(googleUser._id).lean();
      const email = String(userRecord?.email || googleUser.email || "")
        .trim()
        .toLowerCase();

      if (!email) {
        return res.redirect(
          buildFrontendRedirect(req, "/affiliate/login?oauth_error=No%20email%20from%20Google")
        );
      }

      let affiliate = await Affiliate.findOne({ email });
      if (!affiliate) {
        affiliate = await Affiliate.create({
          email,
          password: "google-oauth",
          firstName: userRecord?.firstName || "",
          lastName: userRecord?.lastName || "",
          name: userRecord?.name || "",
          status: "pending",
          affiliateCode: await generateUniqueAffiliateCode(),
          googleLinkedUserId: userRecord?._id || null
        });
        await createAffiliateApprovalNotification(affiliate);
      }

      if (affiliate.status !== "approved") {
        return res.redirect(
          buildFrontendRedirect(req, "/affiliate/login?pending_approval=1")
        );
      }

      affiliate.lastLoginAt = new Date();
      if (!affiliate.googleLinkedUserId && userRecord?._id) {
        affiliate.googleLinkedUserId = userRecord._id;
      }
      await affiliate.save();

      const token = buildAffiliateToken(affiliate._id);
      return res.redirect(
        buildFrontendRedirect(
          req,
          `/affiliate/oauth-success?token=${encodeURIComponent(token)}`
        )
      );
    }
  )(req, res, next);
});

export default router;
