import express from "express";
import User from "../../models/User.js";
import Call from "../../models/Call.js";
import Subscription from "../../models/Subscription.js";
import requireAdmin from "../../middleware/requireAdmin.js";
import statsRoutes from "./statsRoutes.js";
import adminAnalytics from "./adminAnalytics.js";
import adminAnalyticsEnhanced from "./adminAnalyticsEnhanced.js";
import adminUsers from "./adminUsers.js";
import adminActions from "./adminActions.js";
import adminCalls from "./adminCalls.js";
import adminSms from "./adminSms.js";
import adminNumbers from "./adminNumbers.js";
import adminSupport from "./adminSupport.js";
import adminAnalyticsTimeSeries from "./adminAnalyticsTimeSeries.js";
import adminAnalyticsTimeSeriesEnhanced from "./adminAnalyticsTimeSeriesEnhanced.js";
import adminUserCosts from "./adminUserCosts.js";
import adminUsersUpdate from "./adminUsersUpdate.js";
import adminTeam from "./adminTeam.js";
import adminSubscriptionRepair from "./adminSubscriptionRepair.js";
import adminSubscriptionAudit from "./adminSubscriptionAudit.js";
import adminActivationFailures from "./adminActivationFailures.js";
import adminAffiliates from "./adminAffiliates.js";
import adminNotifications from "./adminNotifications.js";
import Plan from "../../models/Plan.js";

const router = express.Router();

// Admin stats (legacy)
router.use("/stats", statsRoutes);

// Analytics dashboard
router.use("/analytics", adminAnalytics);
router.use("/analytics/enhanced", adminAnalyticsEnhanced);
router.use("/analytics/time-series", adminAnalyticsTimeSeries);
router.use("/analytics/time-series/enhanced", adminAnalyticsTimeSeriesEnhanced);

// Users management
router.use("/users", adminUsers);
router.use("/users", adminUserCosts);
router.use("/users", adminUsersUpdate);

// Admin actions (subscription, telnyx controls)
router.use("/actions", adminActions);

// Drill-down pages
router.use("/calls", adminCalls);
router.use("/sms", adminSms);
router.use("/numbers", adminNumbers);
router.use("/support", adminSupport);

// Admin team management
router.use("/team", adminTeam);

// Affiliate management and admin notifications
router.use("/", adminAffiliates);
router.use("/", adminNotifications);

// Subscription repair and audit
router.use("/subscriptions", adminSubscriptionRepair);
router.use("/subscriptions", adminSubscriptionAudit);
router.use("/subscriptions", adminActivationFailures);

/**
 * GET /api/admin/plans
 * Get all available subscription plans
 */
router.get("/plans", requireAdmin, async (req, res) => {
  try {
    const plans = await Plan.find().sort({ price: 1 });
    res.json({
      success: true,
      plans
    });
  } catch (err) {
    console.error("Admin plans error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch plans"
    });
  }
});

/**
 * GET /api/admin/usage
 * Uses Subscription collection as single source of truth
 */
router.get("/usage", requireAdmin, async (req, res) => {
  try {
    const users = await User.find();
    
    // Aggregate usage from Subscription (single source of truth)
    const subscriptions = await Subscription.find({ status: "active" });
    
    let totalSeconds = 0;
    let totalSms = 0;

    subscriptions.forEach(sub => {
      // minutesUsed field stores SECONDS internally
      const secondsUsed = sub.usage?.minutesUsed || 0;
      totalSeconds += secondsUsed;
      totalSms += sub.usage?.smsUsed || 0;
    });

    // Convert seconds to minutes for display (with decimals)
    const totalMinutes = totalSeconds / 60;

    res.json({
      success: true,
      totals: {
        totalUsers: users.length,
        totalActiveSubscriptions: subscriptions.length,
        minutesUsed: parseFloat(totalMinutes.toFixed(2)),
        smsUsed: totalSms
      }
    });
  } catch (err) {
    console.error("Admin usage error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch usage data"
    });
  }
});

export default router;
