import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import passport from "passport";

import connectDB from "./config/db.js";
import { getTelnyx } from "./config/telnyx.js";
import { validateEnv } from "./src/utils/envValidator.js";

import authenticateUser from "./src/middleware/authenticateUser.js";

// Validate environment variables
validateEnv();

import authRoutes from "./src/routes/auth.js";
import callRoutes from "./src/routes/callRoutes.js";
import telnyxVoiceWebhook from "./src/routes/webhooks/telnyxVoice.js";
import telnyxSmsWebhook from "./src/routes/webhooks/telnyxSms.js";
import numberRoutes from "./src/routes/numberRoutes.js";
import telnyxNumbersRoutes from "./src/routes/telnyxNumbers.js";
import subscriptionRoutes from "./src/routes/subscription.js";
import smsRoutes from "./src/routes/smsRoutes.js";
import stripeWebhookRoutes from "./src/routes/stripeWebhookRoutes.js";
import stripeCheckoutRoutes from "./src/routes/stripeCheckoutRoutes.js";
import adminRoutes from "./src/routes/admin/adminRoutes.js";
import contactRoutes from "./src/routes/contactRoutes.js";
import dialerRoutes from "./src/routes/dialerRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import messageRoutes from "./src/routes/messageRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

/* ========================
   ENV CHECK
======================== */
console.log("ENV CHECK AT BOOT:");
console.log("TELNYX_API_KEY =", process.env.TELNYX_API_KEY ? "✅ set" : "❌ missing");
console.log("STRIPE_SECRET_KEY =", process.env.STRIPE_SECRET_KEY ? "✅ set" : "❌ missing");
console.log("JWT_SECRET =", process.env.JWT_SECRET ? "✅ set" : "❌ missing");
console.log("GOOGLE_CALLBACK_URL =", process.env.GOOGLE_CALLBACK_URL ? "✅ set" : "❌ missing");
console.log("MONGODB_URI =", process.env.MONGODB_URI);

/* Init Telnyx */
getTelnyx();

/* ========================
   MIDDLEWARE
======================== */
// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [process.env.FRONTEND_URL];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/* 🚨 REQUIRED FOR GOOGLE OAUTH */
app.use(passport.initialize());

/* Stripe webhook */
app.use(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookRoutes
);

app.use(express.json());

/* ========================
   WEBHOOKS
======================== */
app.use("/api/webhooks/telnyx/voice", telnyxVoiceWebhook);
app.use("/api/webhooks/telnyx/sms", telnyxSmsWebhook);

/* ========================
   ROUTES
======================== */
app.use("/api/auth", authRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/stripe", stripeCheckoutRoutes);

app.use("/api/dialer", dialerRoutes);
app.use("/api/numbers", authenticateUser, numberRoutes);
app.use("/api/numbers", authenticateUser, telnyxNumbersRoutes);
app.use("/api/calls", authenticateUser, callRoutes);
app.use("/api/sms", authenticateUser, smsRoutes);
app.use("/api/messages", authenticateUser, messageRoutes);
app.use("/api/admin", authenticateUser, adminRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/users", authenticateUser, userRoutes);

/* ========================
   HEALTH
======================== */
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    time: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "OTO DIAL API",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      docs: "See API documentation"
    }
  });
});

/* ========================
   ERROR HANDLING
======================== */
// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(err.status || 500).json({
    success: false,
    error: isProduction ? 'Internal server error' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

/* ========================
   START
======================== */
async function startServer() {
  try {
    await connectDB();
    console.log('✅ Database connected');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
