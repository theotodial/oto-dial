import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import loadSubscription from "../middleware/loadSubscription.js";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";

const router = express.Router();

/**
 * GET /api/usage/statistics
 * Get user's call and SMS statistics
 */
router.get(
  "/statistics",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const userId = req.user._id;

      // Get all calls for this user
      const allCalls = await Call.find({ user: userId });

      // Calculate call statistics
      const callsMade = allCalls.filter(c => c.direction === "outbound").length;
      const callsReceived = allCalls.filter(c => c.direction === "inbound").length;
      const callsRings = allCalls.filter(c => 
        c.status === "missed" || 
        c.status === "failed" || 
        (c.ringingDuration > 0 && !c.callStartedAt)
      ).length;
      const totalCalls = allCalls.length;

      // Get all SMS for this user
      const allSms = await SMS.find({ user: userId });

      // Calculate SMS statistics
      const smsSent = allSms.filter(s => s.direction === "outbound").length;
      const smsReceived = allSms.filter(s => s.direction === "inbound").length;
      const totalSms = allSms.length;

      res.json({
        success: true,
        calls: {
          made: callsMade,
          received: callsReceived,
          rings: callsRings,
          total: totalCalls
        },
        sms: {
          sent: smsSent,
          received: smsReceived,
          total: totalSms
        }
      });
    } catch (err) {
      console.error("Usage statistics error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to fetch usage statistics",
        details: err.message
      });
    }
  }
);

export default router;
