import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import passport from "passport";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import { getTelnyx } from "./config/telnyx.js";
import { validateEnv } from "./src/utils/envValidator.js";
import { ensureStripeCatalogConsistency } from "./src/services/stripeCatalogBootstrapService.js";
import { startSubscriptionReconciliationScheduler } from "./src/services/subscriptionReconciliationScheduler.js";

import authenticateUser from "./src/middleware/authenticateUser.js";
import requireAdmin from "./src/middleware/requireAdmin.js";
import loadSubscription from "./src/middleware/loadSubscription.js";

// ========================
// ENV VALIDATION
// ========================
validateEnv();

// ========================
// ROUTES
// ========================
import authRoutes from "./src/routes/auth.js";
import affiliateAuthRoutes from "./src/routes/affiliateAuth.js";
import affiliateRoutes from "./src/routes/affiliateRoutes.js";
import callRoutes from "./src/routes/callRoutes.js";
import dialerRoutes from "./src/routes/dialerRoutes.js";
import numberRoutes from "./src/routes/numberRoutes.js";
import telnyxNumbersRoutes from "./src/routes/telnyxNumbers.js";
import subscriptionRoutes from "./src/routes/subscription.js";
import smsRoutes from "./src/routes/smsRoutes.js";
import stripeCheckoutRoutes from "./src/routes/stripeCheckoutRoutes.js";
import stripeWebhookRoutes from "./src/routes/stripeWebhookRoutes.js";
import adminRoutes from "./src/routes/admin/adminRoutes.js";
import adminAuthRoutes from "./src/routes/admin/adminAuth.js";
import contactRoutes from "./src/routes/contactRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import messageRoutes from "./src/routes/messageRoutes.js";
import userContactRoutes from "./src/routes/userContactRoutes.js";
import pushRoutes from "./src/routes/pushRoutes.js";
import webrtcRoutes from "./src/routes/webrtcRoutes.js";
import usageStatisticsRoutes from "./src/routes/usageStatistics.js";
import supportRoutes from "./src/routes/supportRoutes.js";
import blogRoutes from "./src/routes/blogRoutes.js";
import analyticsRoutes from "./src/routes/analyticsRoutes.js";
import sitePublicRoutes from "./src/routes/sitePublic.js";
import NotFoundLog from "./src/models/NotFoundLog.js";

import telnyxVoiceWebhook from "./src/routes/webhooks/telnyxVoice.js";
import telnyxSmsWebhook from "./src/routes/webhooks/telnyxSms.js";
import telnyxWebhookRoutes from "./src/routes/webhooks/telnyx.js";

const app = express();
const PORT = process.env.PORT || 5000;
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "25mb";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendUploadsDir = path.join(__dirname, "uploads");
const cwdUploadsDir = path.resolve(process.cwd(), "uploads");
const projectRootUploadsDir = path.resolve(__dirname, "..", "uploads");
const legacyUploadsDir = path.resolve(process.env.HOME || "/home/ubuntu", "uploads");
const rootUploadsDir = path.resolve("/root/uploads");
const commonUploadsDirs = [
  path.resolve("/var/www/oto-dial/uploads"),
  path.resolve("/var/www/oto-dial/backend/uploads"),
  path.resolve("/var/www/oto-dial/frontend/uploads"),
  path.resolve("/var/www/oto-dial/frontend/dist/uploads"),
  path.resolve("/var/www/oto-dial/shared/uploads"),
  path.resolve("/var/www/uploads")
];
const uploadSearchRoots = Array.from(
  new Set(
    [
      backendUploadsDir,
      cwdUploadsDir,
      projectRootUploadsDir,
      legacyUploadsDir,
      rootUploadsDir,
      ...commonUploadsDirs,
      process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : null
    ].filter(Boolean)
  )
);

function sanitizeUploadRequestPath(rawPath = "") {
  const decoded = decodeURIComponent(String(rawPath || "")).replace(/\\/g, "/");
  const normalized = path.posix.normalize(`/${decoded}`).replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  const hasTraversal = segments.some((segment) => segment === "..");
  if (!normalized || hasTraversal) {
    return null;
  }
  return normalized;
}

function isFilePath(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findExistingUploadFile(relativePath) {
  const safeRelativePath = sanitizeUploadRequestPath(relativePath);
  if (!safeRelativePath) return null;

  const baseName = path.basename(safeRelativePath);
  const normalizedBaseName = baseName.replace(/\.{2,}/g, ".");
  const normalizedRelativePath = safeRelativePath.replace(/\.{2,}/g, ".");
  const candidateRelativePaths = Array.from(
    new Set([
      safeRelativePath,
      normalizedRelativePath,
      safeRelativePath.startsWith("blog/") ? baseName : `blog/${baseName}`,
      normalizedRelativePath.startsWith("blog/") ? normalizedBaseName : `blog/${normalizedBaseName}`,
      baseName,
      normalizedBaseName,
      `uploads/${safeRelativePath}`,
      `uploads/${normalizedRelativePath}`,
      `uploads/blog/${baseName}`,
      `uploads/blog/${normalizedBaseName}`
    ])
  );

  for (const root of uploadSearchRoots) {
    for (const candidate of candidateRelativePaths) {
      const absolute = path.resolve(root, candidate);
      const normalizedRoot = path.resolve(root);
      if (!absolute.startsWith(normalizedRoot + path.sep) && absolute !== normalizedRoot) {
        continue;
      }
      if (isFilePath(absolute)) {
        return absolute;
      }
    }
  }
  return null;
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// ========================
// BOOT LOGS
// ========================
console.log("ENV CHECK AT BOOT:");
console.log("TELNYX_API_KEY =", process.env.TELNYX_API_KEY ? "✅ set" : "❌ missing");
console.log("STRIPE_SECRET_KEY =", process.env.STRIPE_SECRET_KEY ? "✅ set" : "❌ missing");
console.log("JWT_SECRET =", process.env.JWT_SECRET ? "✅ set" : "❌ missing");
console.log("MONGODB_URI =", process.env.MONGODB_URI);

// Init Telnyx
getTelnyx();

// ========================
// MIDDLEWARE
// ========================
app.use(cors({ origin: true, credentials: true }));
app.use(passport.initialize());

// Stripe webhook must be raw
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

// Backward-compatible Stripe webhook aliases to prevent misconfigured endpoint outages.
app.use(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
app.use("/uploads", express.static(backendUploadsDir));
app.use("/api/uploads", express.static(backendUploadsDir));

// Support deployments where PM2 cwd differs from backend directory.
if (cwdUploadsDir !== backendUploadsDir) {
  app.use("/uploads", express.static(cwdUploadsDir));
  app.use("/api/uploads", express.static(cwdUploadsDir));
}

// Support legacy/root-level uploads storage used by some VPS deploy setups.
if (
  projectRootUploadsDir !== backendUploadsDir &&
  projectRootUploadsDir !== cwdUploadsDir
) {
  app.use("/uploads", express.static(projectRootUploadsDir));
  app.use("/api/uploads", express.static(projectRootUploadsDir));
}

app.get("/api/uploads", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Upload root is available. Request a full file path under /api/uploads/<subdir>/<filename>."
  });
});

// Fallback resolver for deployments where upload storage path moved.
const uploadsFallbackHandler = (req, res, next) => {
  const requestedPath = req.params?.[0] || "";
  const filePath = findExistingUploadFile(requestedPath);
  if (!filePath) {
    return next();
  }
  return res.sendFile(filePath, (err) => {
    if (err) return next(err);
    return undefined;
  });
};
app.get("/uploads/*", uploadsFallbackHandler);
app.get("/api/uploads/*", uploadsFallbackHandler);

// ========================
// WEBHOOKS
// ========================
app.use("/api/webhooks/telnyx/voice", telnyxVoiceWebhook);
app.use("/api/webhooks/telnyx/sms", telnyxSmsWebhook);
app.use("/webhooks/telnyx", telnyxWebhookRoutes);

// ========================
// PUBLIC
// ========================
app.use("/api/auth", authRoutes);
app.use("/api/affiliate/auth", affiliateAuthRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/admin/auth", adminAuthRoutes); // Admin auth (no auth middleware needed for login)
app.use("/api/site", sitePublicRoutes);

// ========================
// PROTECTED
// ========================
app.use("/api/users", authenticateUser, loadSubscription, userRoutes);
app.use("/api/subscription", authenticateUser, loadSubscription, subscriptionRoutes);
app.use("/api/stripe", authenticateUser, stripeCheckoutRoutes);
app.use("/api/dialer", authenticateUser, loadSubscription, dialerRoutes);
app.use("/api/numbers", authenticateUser, loadSubscription, numberRoutes);
app.use("/api/numbers", authenticateUser, loadSubscription, telnyxNumbersRoutes);
app.use("/api/calls", authenticateUser, loadSubscription, callRoutes);
app.use("/api/sms", authenticateUser, loadSubscription, smsRoutes);
app.use("/api/messages", authenticateUser, loadSubscription, messageRoutes);
app.use("/api/contacts", authenticateUser, contactRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/webrtc", authenticateUser, loadSubscription, webrtcRoutes);
app.use("/api/usage", authenticateUser, loadSubscription, usageStatisticsRoutes);
app.use("/api/support", supportRoutes); // Support routes (authenticateUser is in the route file)
app.use("/api/blog", blogRoutes); // Blog routes (public and admin routes inside)
app.use("/api/analytics", analyticsRoutes); // Analytics routes (public and admin routes inside)
app.use("/api/affiliate", affiliateRoutes);
// Admin routes: Only require authentication, NOT subscription (admins don't need subscriptions)
app.use("/api/admin", authenticateUser, requireAdmin, adminRoutes);

// ========================
// HEALTH
// ========================
app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", time: new Date().toISOString() });
});

// Webhook info endpoint (public, for debugging)
app.get("/api/webhook-info", (req, res) => {
  const backendUrl = process.env.BACKEND_URL || "YOUR_BACKEND_URL";
  res.json({
    success: true,
    message: "Webhook Configuration",
    webhooks: {
      voice: `${backendUrl}/api/webhooks/telnyx/voice`,
      sms: `${backendUrl}/api/webhooks/telnyx/sms`,
      stripe: `${backendUrl}/api/webhooks/stripe`,
      stripeAliases: [
        `${backendUrl}/webhooks/stripe`,
        `${backendUrl}/api/stripe/webhook`
      ]
    },
    instructions: {
      voice: "Configure this URL on your Telnyx TeXML App or SIP Connection under Call Control settings",
      sms: "This URL is automatically set on messaging profiles when buying numbers",
      stripe:
        "Configure Stripe to send checkout.session.completed, invoice.payment_succeeded/invoice.paid, and customer.subscription events."
    },
    envStatus: {
      BACKEND_URL: process.env.BACKEND_URL ? "✅ SET" : "❌ NOT SET",
      TELNYX_CONNECTION_ID: process.env.TELNYX_CONNECTION_ID ? "✅ SET" : "❌ NOT SET",
      TELNYX_SIP_USERNAME: process.env.TELNYX_SIP_USERNAME ? "✅ SET" : "❌ NOT SET",
      TELNYX_API_KEY: process.env.TELNYX_API_KEY ? "✅ SET" : "❌ NOT SET",
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? "✅ SET" : "❌ NOT SET"
    }
  });
});

app.get("/", (req, res) => {
  res.json({ success: true, message: "OTO DIAL API" });
});

// ========================
// 404 MONITORING (API ONLY)
// ========================
app.use("/api", async (req, res, next) => {
  try {
    if (res.headersSent) return next();
    const pathname = String(req.originalUrl || "").split("?")[0] || "";
    const method = String(req.method || "GET").toUpperCase();

    // Avoid logging noisy preflight OPTIONS.
    if (method === "OPTIONS") {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    await NotFoundLog.findOneAndUpdate(
      { path: pathname, method },
      {
        $inc: { count: 1 },
        $set: {
          lastSeenAt: new Date(),
          lastIp: String(req.ip || ""),
          lastUserAgent: String(req.get("user-agent") || "")
        }
      },
      { upsert: true }
    );
  } catch (err) {
    // Never crash on 404 logging.
    console.warn("404 log failed:", err?.message || err);
  }
  return res.status(404).json({ success: false, error: "Not found" });
});

// Friendly payload-too-large response for clients (instead of raw HTML 413 pages).
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      success: false,
      error: "Request payload too large. Please upload smaller images or use image URLs."
    });
  }
  return next(err);
});

// ========================
// START
// ========================
async function startServer() {
  try {
    await connectDB();
    console.log("✅ Database connected");

    try {
      const catalogFix = await ensureStripeCatalogConsistency();
      if (catalogFix.plansUpdated || catalogFix.addonsUpdated) {
        console.log(
          `✅ Stripe catalog consistency applied (plans: ${catalogFix.plansUpdated}, addons: ${catalogFix.addonsUpdated})`
        );
      }
    } catch (catalogErr) {
      console.error("⚠️ Stripe catalog consistency check failed:", catalogErr.message);
    }

    try {
      startSubscriptionReconciliationScheduler();
    } catch (reconciliationErr) {
      console.error("⚠️ Subscription reconciliation scheduler failed to start:", reconciliationErr.message);
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
