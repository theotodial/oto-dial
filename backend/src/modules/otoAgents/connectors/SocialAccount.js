import mongoose from "mongoose";

const socialAccountSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["instagram", "x", "linkedin", "facebook", "tiktok", "reddit", "youtube"],
      required: true,
      index: true,
    },
    username: { type: String, required: true, trim: true },
    encryptedCredentials: {
      iv: { type: String, default: null },
      tag: { type: String, default: null },
      data: { type: String, default: null },
    },
    tokens: {
      encryptedAccessToken: { type: String, default: null },
      encryptedRefreshToken: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      scopes: { type: [String], default: [] },
    },
    permissions: {
      canRead: { type: Boolean, default: true },
      canDraft: { type: Boolean, default: true },
      canPublish: { type: Boolean, default: false },
      canReply: { type: Boolean, default: false },
      requiresApproval: { type: Boolean, default: true },
    },
    linkedAgents: [{ type: mongoose.Schema.Types.ObjectId, ref: "AIAgent" }],
    status: {
      type: String,
      enum: ["connected", "needs_auth", "disabled", "error"],
      default: "needs_auth",
      index: true,
    },
    lastSyncAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

socialAccountSchema.index({ platform: 1, username: 1 }, { unique: true });

socialAccountSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject();
  delete obj.encryptedCredentials;
  if (obj.tokens) {
    obj.tokens = {
      hasAccessToken: Boolean(obj.tokens.encryptedAccessToken),
      hasRefreshToken: Boolean(obj.tokens.encryptedRefreshToken),
      expiresAt: obj.tokens.expiresAt || null,
      scopes: obj.tokens.scopes || [],
    };
  }
  return obj;
};

export default mongoose.model("SocialAccount", socialAccountSchema);
