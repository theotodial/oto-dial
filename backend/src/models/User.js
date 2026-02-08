import mongoose from "mongoose";

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

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
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
      default: false
    },
     
    plan: { 
      type: String, 
      default: null
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
      default: 0
    },

    smsUsed: {
      type: Number,
      default: 0
    },

    // Track active sessions for multiple device login
    sessions: [{
      deviceInfo: String,
      userAgent: String,
      ipAddress: String,
      lastLogin: { type: Date, default: Date.now },
      token: String
    }],

    // Profile picture
    profilePicture: {
      type: String,
      default: null
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

export default mongoose.model("User", userSchema);
