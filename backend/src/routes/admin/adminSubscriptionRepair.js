import express from "express";
import mongoose from "mongoose";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import requireAdmin from "../../middleware/requireAdmin.js";
import {
  repairUserSubscriptionFromStripe
} from "../../services/stripeSubscriptionService.js";

const router = express.Router();

router.use(requireAdmin);

/**
 * POST /api/admin/subscriptions/resync/:userId
 * Re-sync user's subscription from Stripe
 */
router.post("/resync/:userId", async (req, res) => {
  try {
    const result = await repairUserSubscriptionFromStripe({
      userId: req.params.userId,
      reason: "admin_resync"
    });

    if (!result.success) {
      const statusCode = result.error === "User not found" ? 404 : 400;
      return res.status(statusCode).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      message: "Subscription re-synced from Stripe",
      ...result
    });
  } catch (err) {
    console.error("Resync error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/subscriptions/reattach/:subscriptionId
 * Manually reattach subscription to user
 */
router.post("/reattach/:subscriptionId", async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const user = await User.findById(subscription.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Atomically link subscription to user
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      subscription.status = "active";
      await subscription.save({ session });

      user.activeSubscriptionId = subscription._id;
      user.subscriptionActive = true;
      user.currentPlanId = subscription.planId || null;
      user.currentSubscriptionLimits = subscription.limits || {
        minutesTotal: 0,
        smsTotal: 0,
        numbersTotal: 0
      };
      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: "Subscription reattached to user",
        subscriptionId: subscription._id,
        userId: user._id
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("Reattach error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/subscriptions/force-activate/:subscriptionId
 * Force activate subscription (admin only)
 */
router.post("/force-activate/:subscriptionId", async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.subscriptionId);
    if (!subscription) {
      return res.status(404).json({ error: "Subscription not found" });
    }

    const user = await User.findById(subscription.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Atomically activate
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      subscription.status = "active";
      await subscription.save({ session });

      user.activeSubscriptionId = subscription._id;
      user.subscriptionActive = true;
      user.currentPlanId = subscription.planId || null;
      user.currentSubscriptionLimits = subscription.limits || {
        minutesTotal: 0,
        smsTotal: 0,
        numbersTotal: 0
      };
      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: "Subscription force-activated",
        subscriptionId: subscription._id,
        userId: user._id
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("Force activate error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
