import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Plan from "../../models/Plan.js";
import getTelnyxClient from "../../services/telnyxService.js";
import Stripe from "stripe";

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/**
 * ================================
 * SUBSCRIPTION CONTROLS
 * ================================
 */

/**
 * POST /api/admin/actions/subscription/assign
 * Assign subscription to user
 */
router.post("/subscription/assign", requireAdmin, async (req, res) => {
  try {
    const { userId, planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({
        success: false,
        error: "userId and planId are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: "Plan not found"
      });
    }

    // Cancel existing subscription
    await Subscription.updateMany(
      { userId },
      { status: "cancelled" }
    );

    // Create new subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await Subscription.create({
      userId,
      planId,
      status: "active",
      periodStart: now,
      periodEnd,
      limits: plan.limits,
      ratePerMinute: 0.0065 // Default rate, can be customized per plan if needed
    });

    res.json({
      success: true,
      message: "Subscription assigned successfully",
      subscription
    });
  } catch (err) {
    console.error("Assign subscription error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to assign subscription"
    });
  }
});

/**
 * POST /api/admin/actions/subscription/cancel
 * Cancel user subscription
 */
router.post("/subscription/cancel", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const result = await Subscription.updateMany(
      { userId, status: "active" },
      { status: "cancelled" }
    );

    res.json({
      success: true,
      message: "Subscription cancelled",
      updated: result.modifiedCount
    });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to cancel subscription"
    });
  }
});

/**
 * POST /api/admin/actions/subscription/resume
 * Resume cancelled subscription
 */
router.post("/subscription/resume", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const subscription = await Subscription.findOne({
      userId,
      status: "cancelled"
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "No cancelled subscription found"
      });
    }

    subscription.status = "active";
    await subscription.save();

    res.json({
      success: true,
      message: "Subscription resumed",
      subscription
    });
  } catch (err) {
    console.error("Resume subscription error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to resume subscription"
    });
  }
});

/**
 * POST /api/admin/actions/subscription/change-plan
 * Change user's subscription plan
 */
router.post("/subscription/change-plan", requireAdmin, async (req, res) => {
  try {
    const { userId, planId } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({
        success: false,
        error: "userId and planId are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: "Plan not found"
      });
    }

    // Find active subscription
    const subscription = await Subscription.findOne({
      userId,
      status: "active"
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "No active subscription found"
      });
    }

    // Update subscription plan
    subscription.planId = planId;
    subscription.limits = plan.limits;
    await subscription.save();

    res.json({
      success: true,
      message: "Subscription plan changed successfully",
      subscription
    });
  } catch (err) {
    console.error("Change plan error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to change subscription plan",
      details: err.message
    });
  }
});

/**
 * POST /api/admin/actions/subscription/set-trial
 * Set user subscription to trial (free, limited time)
 */
router.post("/subscription/set-trial", requireAdmin, async (req, res) => {
  try {
    const { userId, trialDays = 7 } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Find or create trial plan
    let trialPlan = await Plan.findOne({ name: "Trial" });
    if (!trialPlan) {
      trialPlan = await Plan.create({
        name: "Trial",
        price: 0,
        limits: {
          minutesTotal: 100,
          smsTotal: 50
        }
      });
    }

    // Cancel existing subscriptions
    await Subscription.updateMany(
      { userId },
      { status: "cancelled" }
    );

    // Create trial subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + trialDays);

    const subscription = await Subscription.create({
      userId,
      planId: trialPlan._id,
      status: "active",
      periodStart: now,
      periodEnd,
      limits: trialPlan.limits,
      ratePerMinute: 0.0065
    });

    res.json({
      success: true,
      message: `Trial subscription created for ${trialDays} days`,
      subscription,
      expiresAt: periodEnd
    });
  } catch (err) {
    console.error("Set trial error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to set trial subscription",
      details: err.message
    });
  }
});

/**
 * ================================
 * USER PASSWORD CONTROLS
 * ================================
 */

/**
 * POST /api/admin/actions/user/reset-password
 * Reset user password (admin-only)
 */
router.post("/user/reset-password", requireAdmin, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "userId and newPassword are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Update password (plain text as per current schema)
    // TODO: Consider migrating to bcrypt for security
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully",
      userId: user._id
    });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to reset password",
      details: err.message
    });
  }
});

/**
 * POST /api/admin/actions/user/generate-password
 * Generate a secure random password for user
 */
router.post("/user/generate-password", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Generate secure random password (12 characters)
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let newPassword = "";
    for (let i = 0; i < 12; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password generated successfully",
      userId: user._id,
      newPassword: newPassword, // Return password so admin can share with user
      warning: "Store this password securely - it will not be shown again"
    });
  } catch (err) {
    console.error("Generate password error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to generate password",
      details: err.message
    });
  }
});

/**
 * ================================
 * TELNYX CONTROLS
 * ================================
 */

/**
 * POST /api/admin/actions/telnyx/assign-number
 * Assign phone number to user
 */
router.post("/telnyx/assign-number", requireAdmin, async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;

    if (!userId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "userId and phoneNumber are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Find or create phone number record
    let phoneNumberRecord = await PhoneNumber.findOne({ phoneNumber });

    if (phoneNumberRecord) {
      // Reassign existing number
      phoneNumberRecord.userId = userId;
      phoneNumberRecord.status = "active";
      await phoneNumberRecord.save();
    } else {
      // Create new record (number should already exist in Telnyx)
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({
          success: false,
          error: "Telnyx not configured"
        });
      }

      // Get number details from Telnyx
      let telnyxNumberId = null;
      let monthlyCost = 0;
      let oneTimeFees = 0;
      let carrierGroup = null;
      
      try {
        const telnyxNumber = await telnyx.phoneNumbers.retrieve(phoneNumber);
        telnyxNumberId = telnyxNumber.data.id;
        monthlyCost = telnyxNumber.data.monthly_cost || telnyxNumber.data.monthly_rate || 0;
        oneTimeFees = telnyxNumber.data.one_time_cost || 0;
        carrierGroup = telnyxNumber.data.carrier?.group || telnyxNumber.data.carrier_group || null;
      } catch (err) {
        console.warn("Could not fetch Telnyx number details:", err.message);
      }

      phoneNumberRecord = await PhoneNumber.create({
        userId,
        phoneNumber,
        telnyxPhoneNumberId: telnyxNumberId || phoneNumber,
        status: "active",
        messagingProfileId: user.messagingProfileId,
        monthlyCost: monthlyCost,
        oneTimeFees: oneTimeFees,
        carrierGroup: carrierGroup,
        purchaseDate: new Date()
      });
    }

    res.json({
      success: true,
      message: "Phone number assigned successfully",
      phoneNumber: phoneNumberRecord
    });
  } catch (err) {
    console.error("Assign number error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to assign phone number"
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/buy-number
 * Buy new number for user
 */
router.post("/telnyx/buy-number", requireAdmin, async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;

    if (!userId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "userId and phoneNumber are required"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    const telnyx = getTelnyxClient();
    if (!telnyx) {
      return res.status(500).json({
        success: false,
        error: "Telnyx not configured"
      });
    }

    // Purchase number from Telnyx
    const order = await telnyx.numberOrders.create({
      phone_numbers: [{ phone_number: phoneNumber }]
    });

    // Create phone number record
    const phoneNumberRecord = await PhoneNumber.create({
      userId,
      phoneNumber,
      telnyxPhoneNumberId: order.data.id,
      status: "active",
      messagingProfileId: user.messagingProfileId
    });

    // Attach to messaging profile if exists
    if (user.messagingProfileId) {
      await telnyx.messaging.messagingProfiles.phoneNumbers.create(
        user.messagingProfileId,
        { phone_number: phoneNumber }
      );
    }

    res.json({
      success: true,
      message: "Phone number purchased successfully",
      phoneNumber: phoneNumberRecord
    });
  } catch (err) {
    console.error("Buy number error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to buy phone number",
      details: err.message
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/release-number
 * Release phone number from user
 */
router.post("/telnyx/release-number", requireAdmin, async (req, res) => {
  try {
    const { phoneNumberId } = req.body;

    if (!phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: "phoneNumberId is required"
      });
    }

    const phoneNumber = await PhoneNumber.findById(phoneNumberId);
    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: "Phone number not found"
      });
    }

    // Mark as released in database
    phoneNumber.status = "released";
    await phoneNumber.save();

    // Optionally release from Telnyx (uncomment if needed)
    // const telnyx = getTelnyxClient();
    // if (telnyx) {
    //   await telnyx.phoneNumbers.delete(phoneNumber.phoneNumber);
    // }

    res.json({
      success: true,
      message: "Phone number released successfully"
    });
  } catch (err) {
    console.error("Release number error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to release phone number"
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/block-calls
 * Block outbound calls for user
 */
router.post("/telnyx/block-calls", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    // Suspend user (which blocks calls via usage guards)
    await User.findByIdAndUpdate(userId, { status: "suspended" });
    await Subscription.updateMany(
      { userId },
      { status: "suspended" }
    );

    res.json({
      success: true,
      message: "Outbound calls blocked for user"
    });
  } catch (err) {
    console.error("Block calls error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to block calls"
    });
  }
});

/**
 * POST /api/admin/actions/telnyx/block-sms
 * Block SMS for user
 */
router.post("/telnyx/block-sms", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required"
      });
    }

    // Suspend user (which blocks SMS via usage guards)
    await User.findByIdAndUpdate(userId, { status: "suspended" });
    await Subscription.updateMany(
      { userId },
      { status: "suspended" }
    );

    res.json({
      success: true,
      message: "SMS blocked for user"
    });
  } catch (err) {
    console.error("Block SMS error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to block SMS"
    });
  }
});

export default router;
