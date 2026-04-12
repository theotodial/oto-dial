import express from "express";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";

const router = express.Router();

/**
 * GET /api/usage/statistics
 * Get user's call and SMS statistics
 */
router.get(
  "/statistics",
  async (req, res) => {
    try {
      const [callStats, smsStats] = await Promise.all([
        Call.aggregate([
          { $match: { user: req.user._id } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              made: {
                $sum: {
                  $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0],
                },
              },
              received: {
                $sum: {
                  $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0],
                },
              },
              rings: {
                $sum: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$status", "missed"] },
                        { $eq: ["$status", "failed"] },
                        {
                          $and: [
                            { $gt: ["$ringingDuration", 0] },
                            { $eq: ["$callStartedAt", null] },
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ]),
        SMS.aggregate([
          { $match: { user: req.user._id } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              sent: {
                $sum: {
                  $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0],
                },
              },
              received: {
                $sum: {
                  $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0],
                },
              },
            },
          },
        ]),
      ]);

      const calls = callStats[0] || { made: 0, received: 0, rings: 0, total: 0 };
      const sms = smsStats[0] || { sent: 0, received: 0, total: 0 };

      res.json({
        success: true,
        calls: {
          made: calls.made,
          received: calls.received,
          rings: calls.rings,
          total: calls.total
        },
        sms: {
          sent: sms.sent,
          received: sms.received,
          total: sms.total
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
