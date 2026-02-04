import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import SMS from "../../models/SMS.js";

const router = express.Router();

/**
 * GET /api/admin/sms
 * Get all SMS with filters, pagination, and cost details
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search, 
      userId, 
      direction, 
      status,
      startDate,
      endDate
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};

    if (userId) {
      query.user = userId;
    }

    if (direction) {
      query.direction = direction;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { from: { $regex: search, $options: "i" } },
        { to: { $regex: search, $options: "i" } },
        { body: { $regex: search, $options: "i" } }
      ];
    }

    const smsList = await SMS.find(query)
      .populate("user", "email name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SMS.countDocuments(query);

    // Calculate totals
    const totalSms = await SMS.countDocuments(query);
    const totalCost = await SMS.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$cost" } } }
    ]);

    res.json({
      success: true,
      sms: smsList.map(sms => ({
        id: sms._id,
        messageId: sms.telnyxMessageId,
        userId: sms.user?._id,
        userEmail: sms.user?.email,
        userName: sms.user?.name,
        from: sms.from,
        to: sms.to,
        body: sms.body,
        direction: sms.direction,
        status: sms.status,
        carrier: sms.carrier,
        costPerSms: sms.costPerSms || sms.cost,
        carrierFees: sms.carrierFees || 0,
        totalCost: sms.cost || 0,
        createdAt: sms.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      totals: {
        totalSms,
        totalCost: totalCost[0]?.total || 0
      }
    });
  } catch (err) {
    console.error("Admin SMS error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch SMS"
    });
  }
});

/**
 * GET /api/admin/sms/:id
 * Get single SMS details
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const sms = await SMS.findById(req.params.id).populate("user", "email name");

    if (!sms) {
      return res.status(404).json({
        success: false,
        error: "SMS not found"
      });
    }

    res.json({
      success: true,
      sms: {
        id: sms._id,
        messageId: sms.telnyxMessageId,
        userId: sms.user?._id,
        userEmail: sms.user?.email,
        userName: sms.user?.name,
        from: sms.from,
        to: sms.to,
        body: sms.body,
        direction: sms.direction,
        status: sms.status,
        carrier: sms.carrier,
        costPerSms: sms.costPerSms || sms.cost,
        carrierFees: sms.carrierFees || 0,
        totalCost: sms.cost || 0,
        createdAt: sms.createdAt,
        updatedAt: sms.updatedAt
      }
    });
  } catch (err) {
    console.error("Admin SMS detail error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch SMS details"
    });
  }
});

export default router;
