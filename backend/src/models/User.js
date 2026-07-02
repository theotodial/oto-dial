import mongoose from "mongoose";
import { ADMIN_ACCESS_AREAS } from "../constants/adminAccess.js";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true
    },

    password: {
      type: String,
      required: true
    },

    firstName: {
      type: String,
      default: ""
    },

    lastName: {
      type: String,
      default: ""
    },

    name: {
      type: String,
      default: ""
    },

    phone: {
      type: String,
      default: ""
    },

    company: {
      type: String,
      default: ""
    },

    businessType: {
      type: String,
      default: ""
    },

    country: {
      type: String,
      default: ""
    },

    timezone: {
      type: String,
      default: ""
    },

    language: {
      type: String,
      default: "en"
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    adminRoles: {
      type: [
        {
          type: String,
          enum: ADMIN_ACCESS_AREAS
        }
      ],
      default: []
    },

    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active"
    },

    stripeCustomerId: { 
      type: String,
      index: true
    },

    activeSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true
    },

    subscriptionActive: {
      type: Boolean,
      default: false,
      select: false,
    },

    currentPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      default: null,
      index: true
    },

    currentSubscriptionLimits: {
      minutesTotal: { type: Number, default: 0 },
      smsTotal: { type: Number, default: 0 },
      numbersTotal: { type: Number, default: 0 },
    },

    lastSubscriptionSyncAt: {
      type: Date,
      default: null
    },
     
    plan: {
      type: String,
      default: null,
      select: false,
    },

    telnyxNumber: {
      type: String,
      default: null
    },

    // ✅ REQUIRED FOR SMS
    messagingProfileId: {
      type: String,
      default: null
    },

    minutesUsed: {
      type: Number,
      default: 0,
      select: false,
    },
    remainingCredits: {
      type: Number,
      default: 0,
      index: true,
    },
    totalCreditsUsed: {
      type: Number,
      default: 0,
    },
    reservedCredits: {
      type: Number,
      default: 0,
    },
    lifetimeCreditsPurchased: {
      type: Number,
      default: 0,
    },
    riskFlags: {
      negativeMargin: {
        type: Boolean,
        default: false,
        index: true,
      },
      abuseRisk: {
        type: Boolean,
        default: false,
        index: true,
      },
      coldCallPattern: {
        type: Boolean,
        default: false,
      },
      burningCreditsFasterThanRevenue: {
        type: Boolean,
        default: false,
      },
      lastRiskEvaluatedAt: {
        type: Date,
        default: null,
      },
      lastRejectRatio: {
        type: Number,
        default: 0,
      },
      lastGrossMargin: {
        type: Number,
        default: 0,
      },
      lastAvgCallDuration: {
        type: Number,
        default: 0,
      },
      outboundAttemptVolume: {
        type: Number,
        default: 0,
      },
      throttleDelayMs: {
        type: Number,
        default: 0,
      },
      reservationMultiplier: {
        type: Number,
        default: 1,
      },
      maxConcurrentCalls: {
        type: Number,
        default: null,
      },
    },

    /** Admin manual overrides for profit guardrails (expires + optional note). */
    riskOverrides: {
      reservationMultiplier: {
        type: Number,
        default: null,
      },
      throttleDelayMs: {
        type: Number,
        default: null,
      },
      maxConcurrentCalls: {
        type: Number,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
        index: true,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      note: {
        type: String,
        default: "",
      },
    },

    smsUsed: {
      type: Number,
      default: 0,
      select: false,
    },

    // Track active sessions for multiple device login
    sessions: [{
      deviceInfo: String,
      userAgent: String,
      ipAddress: String,
      lastLogin: { type: Date, default: Date.now },
      token: String
    }],

    referredByAffiliate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Affiliate",
      default: null,
      index: true
    },

    referredByAffiliateCode: {
      type: String,
      default: null
    },

    affiliateReferredAt: {
      type: Date,
      default: null
    },

    // Profile picture
    profilePicture: {
      type: String,
      default: null
    },

    /** When true, outbound SMS after warmup must be admin-approved (silent to user). */
    smsApprovalFlag: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** While flagged: first N outbound messages skip moderation (atomic decrement per send). */
    smsApprovalWarmupRemaining: {
      type: Number,
      default: 5,
    },

    // Email verification (email/password signups). Legacy users may omit this field.
    isEmailVerified: {
      type: Boolean,
      default: undefined,
    },
    emailVerificationToken: {
      type: String,
      default: null,
      index: true,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
    },

    // Throttle verification / resend emails (e.g. 45s between sends)
    lastVerificationEmailSentAt: {
      type: Date,
      default: null,
    },

    // Password reset (hashed token in DB; plain token only in email link)
    resetPasswordToken: {
      type: String,
      default: null,
      index: true,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },

    // Throttle usage warning emails (avoid spamming on every /api/subscription poll)
    lastUsageWarningEmailAt: {
      type: Date,
      default: null,
    },

    lastUpgradePlanEmailAt: {
      type: Date,
      default: null,
    },

    // One-time pricing nudge after signup when user has no active subscription
    pricingOnboardingEmailSentAt: {
      type: Date,
      default: null,
    },

    features: {
      voiceEnabled: {
        type: Boolean,
        default: true,
      },
      campaignEnabled: {
        type: Boolean,
        default: false,
      },
    },
    allowedCallCountries: {
      type: [String],
      default: [],
    },

    mode: {
      type: String,
      enum: ["voice", "campaign"],
      default: "voice",
      index: true
    },

    /** UI preferences (non-billing) */
    preferences: {
      campaignMode: {
        type: String,
        enum: ["lite", "pro"],
        default: "lite",
      },
    },

    /** SMS automation (Pro); inbound auto-reply + rules */
    messagingAutomation: {
      autoReplyEnabled: {
        type: Boolean,
        default: false,
      },
      autoReplyRules: {
        type: [
          {
            keyword: { type: String, default: "" },
            response: { type: String, default: "" },
            useAi: { type: Boolean, default: false },
            aiPrompt: { type: String, default: "" },
            isFallback: { type: Boolean, default: false },
          },
        ],
        default: [],
      },
    },

    // Identity verification
    identityVerification: {
      status: {
        type: String,
        enum: ["pending", "approved", "rejected", "not_submitted"],
        default: "not_submitted"
      },
      idDocument: {
        type: String, // URL to uploaded document
        default: null
      },
      businessDocument: {
        type: String, // URL to uploaded document
        default: null
      },
      verificationType: {
        type: String,
        enum: ["individual", "business"],
        default: null
      },
      submittedAt: {
        type: Date,
        default: null
      },
      reviewedAt: {
        type: Date,
        default: null
      },
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },
      rejectionReason: {
        type: String,
        default: null
      },
      legalName: {
        type: String,
        default: null
      },
      dateOfBirth: {
        type: String,
        default: null
      },
      documentType: {
        type: String,
        enum: ["passport", "drivers_license", "national_id", "other", null],
        default: null
      },
      documentCountry: {
        type: String,
        default: null
      },
      addressLine1: {
        type: String,
        default: null
      },
      city: {
        type: String,
        default: null
      },
      stateRegion: {
        type: String,
        default: null
      },
      postalCode: {
        type: String,
        default: null
      },
      idDocumentBack: {
        type: String,
        default: null
      },
      selfieDocument: {
        type: String,
        default: null
      },
      selfieLiveness: {
        sessionId: { type: String, default: null },
        completedAt: { type: Date, default: null },
        passed: { type: Boolean, default: false },
        livenessScore: { type: Number, default: null },
        faceMatchScore: { type: Number, default: null },
        faceMatchPassed: { type: Boolean, default: null },
        faceMatchRequired: { type: Boolean, default: false },
        challenges: { type: [String], default: [] },
      },
      aiVerification: {
        overallScore: { type: Number, default: null },
        nameMatchScore: { type: Number, default: null },
        faceMatchScore: { type: Number, default: null },
        livenessScore: { type: Number, default: null },
        faceMatchRequired: { type: Boolean, default: false },
        faceMatchPassed: { type: Boolean, default: null },
        autoApproved: { type: Boolean, default: false },
        decision: {
          type: String,
          enum: ["approved", "pending_manual", "rejected", null],
          default: null,
        },
        reasons: { type: [String], default: [] },
        evaluatedAt: { type: Date, default: null },
      },
    }
  },
  { timestamps: true }
);

userSchema.plugin(mongoPerformancePlugin, { label: "users" });
userSchema.index({ createdAt: -1 });

export default mongoose.model("User", userSchema);
