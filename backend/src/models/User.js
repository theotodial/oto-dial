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
      }
    }
  },
  { timestamps: true }
);

userSchema.plugin(mongoPerformancePlugin, { label: "users" });
userSchema.index({ createdAt: -1 });

export default mongoose.model("User", userSchema);
