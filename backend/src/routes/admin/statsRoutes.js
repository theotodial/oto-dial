import express from "express";
import Call from "../../models/Call.js";

const router = express.Router();

router.get("/stats/usage", async (req, res) => {
  const stats = await Call.aggregate([
    {
      $group: {
        _id: {
          day: { $dayOfMonth: "$createdAt" },
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" }
        },
        totalCalls: { $sum: 1 },
        totalMinutes: { $sum: "$billedMinutes" },
        totalRevenue: { $sum: "$cost" }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 } }
  ]);

  res.json({ success: true, stats });
});

export default router;
