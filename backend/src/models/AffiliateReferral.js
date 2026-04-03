import mongoose from "mongoose";

const affiliateReferralSchema = new mongoose.Schema(
  {
    affiliateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Affiliate",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true
    },
    userEmail: {
      type: String,
      default: null
    },
    referralCode: {
      type: String,
      default: null
    },
    source: {
      type: String,
      enum: ["register", "google_oauth", "admin"],
      default: "register"
    },
    status: {
      type: String,
      enum: ["signed_up", "paid", "cancelled"],
      default: "signed_up",
      index: true
    },
    convertedAt: {
      type: Date,
      default: null
    },
    latestSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null
    }
  },
  { timestamps: true }
);

affiliateReferralSchema.index({ affiliateId: 1, createdAt: -1 });

export default mongoose.model("AffiliateReferral", affiliateReferralSchema);
