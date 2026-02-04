import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/**
 * Admin User Model
 * Manages admin team access with role-based permissions
 */
const adminUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },

    password: {
      type: String,
      required: true
    },

    name: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: [
        "super_admin",    // Full access, can manage other admins
        "admin",          // Full access except admin management
        "view_only",      // Read-only access
        "stats_only",     // Only analytics/stats access
        "edit_only",      // Can edit users/subscriptions
        "support_only"    // Support team - can view and respond to tickets
      ],
      default: "view_only",
      index: true
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    lastLogin: {
      type: Date,
      default: null
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null
    },

    permissions: {
      // Granular permissions (can override role defaults)
      canViewUsers: { type: Boolean, default: true },
      canEditUsers: { type: Boolean, default: false },
      canDeleteUsers: { type: Boolean, default: false },
      canViewAnalytics: { type: Boolean, default: true },
      canViewCosts: { type: Boolean, default: true },
      canManagePricing: { type: Boolean, default: false },
      canManageAdmins: { type: Boolean, default: false },
      canViewSupport: { type: Boolean, default: false },
      canRespondSupport: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true
  }
);

// Hash password before saving
adminUserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
adminUserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Set default permissions based on role
adminUserSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("role")) {
    switch (this.role) {
      case "super_admin":
        this.permissions = {
          canViewUsers: true,
          canEditUsers: true,
          canDeleteUsers: true,
          canViewAnalytics: true,
          canViewCosts: true,
          canManagePricing: true,
          canManageAdmins: true,
          canViewSupport: true,
          canRespondSupport: true
        };
        break;
      case "admin":
        this.permissions = {
          canViewUsers: true,
          canEditUsers: true,
          canDeleteUsers: true,
          canViewAnalytics: true,
          canViewCosts: true,
          canManagePricing: true,
          canManageAdmins: false,
          canViewSupport: true,
          canRespondSupport: true
        };
        break;
      case "view_only":
        this.permissions = {
          canViewUsers: true,
          canEditUsers: false,
          canDeleteUsers: false,
          canViewAnalytics: true,
          canViewCosts: true,
          canManagePricing: false,
          canManageAdmins: false,
          canViewSupport: true,
          canRespondSupport: false
        };
        break;
      case "stats_only":
        this.permissions = {
          canViewUsers: false,
          canEditUsers: false,
          canDeleteUsers: false,
          canViewAnalytics: true,
          canViewCosts: true,
          canManagePricing: false,
          canManageAdmins: false,
          canViewSupport: false,
          canRespondSupport: false
        };
        break;
      case "edit_only":
        this.permissions = {
          canViewUsers: true,
          canEditUsers: true,
          canDeleteUsers: false,
          canViewAnalytics: true,
          canViewCosts: true,
          canManagePricing: false,
          canManageAdmins: false,
          canViewSupport: true,
          canRespondSupport: false
        };
        break;
      case "support_only":
        this.permissions = {
          canViewUsers: true,
          canEditUsers: false,
          canDeleteUsers: false,
          canViewAnalytics: false,
          canViewCosts: false,
          canManagePricing: false,
          canManageAdmins: false,
          canViewSupport: true,
          canRespondSupport: true
        };
        break;
    }
  }
  next();
});

export default mongoose.model("AdminUser", adminUserSchema);
