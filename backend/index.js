import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import passport from "passport";

import connectDB from "./config/db.js";
import { getTelnyx } from "./config/telnyx.js";
import { validateEnv } from "./src/utils/envValidator.js";

import authenticateUser from "./src/middleware/authenticateUser.js";
import loadSubscription from "./src/middleware/loadSubscription.js";

// ========================
// ENV VALIDATION
// ========================
validateEnv();

// ========================
// ROUTES IMPORT
// ========================
import authRoutes from "./src/routes/auth.js";
import callRoutes from "./src/routes/callRoutes.js";
import dialerRoutes from "./src/routes/dialerRoutes.js";
import numberRoutes from "./src/routes/numberRoutes.js";
import telnyxNumbersRoutes from "./src/routes/telnyxNumbers.js";
import subscriptionRoutes from "./src/routes/subscription.js";
import smsRoutes from "./src/routes/smsRoutes.js";
import stripeCheckoutRoutes from "./src/routes/stripeCheckoutRoutes.js";
import stripeWebhookRoutes from "./src/routes/stripeWebhookRoutes.js";
import adminRoutes from "./src/routes/admin/adminRoutes.js";
import contactRoutes from "./src/routes/contactRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import messageRoutes from "./src/routes/messageRoutes.js";

import telnyxVoiceWebhook from "./src/routes/webhooks/telnyxVoice.js";
import telnyxSmsWebhook from "./src/routes/webhooks/telnyxSms.js";

const app = express();
const PORT = process.env.PORT || 5000;

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
// GLOBAL MIDDLEWARE
// ========================
app.use(cors({ origin: true, credentials: true }));
app.use(passport.initialize());

// Stripe webhook MUST be raw
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

// JSON parser AFTER Stripe webhook
app.use(express.json());

// ========================
// PUBLIC WEBHOOKS (NO AUTH)
// ========================
app.use("/api/webhooks/telnyx/voice", telnyxVoiceWebhook);
app.use("/api/webhooks/telnyx/sms", telnyxSmsWebhook);

// ========================
// PUBLIC ROUTES (NO AUTH)
// ========================
app.use("/api/auth", authRoutes);
app.use("/api/contact", contactRoutes);

// ========================
// PROTECTED ROUTES (AUTH + SUBSCRIPTION)
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
app.use("/api/admin", authenticateUser, loadSubscription, adminRoutes);

// ========================
// HEALTH
// ========================
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    time: new Date().toISOString()
  });
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "OTO DIAL API"
  });
});

// ========================
// ERROR HANDLING
// ========================
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error"
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found"
  });
});

// ========================
// START SERVER
// ========================
async function startServer() {
  try {
    await connectDB();
    console.log("✅ Database connected");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
