import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import User from "../../models/User.js";

const router = express.Router();

/**
 * GET /api/admin/calls
 * Get all calls with filters, pagination, and cost details
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
        { phoneNumber: { $regex: search, $options: "i" } },
        { fromNumber: { $regex: search, $options: "i" } },
        { toNumber: { $regex: search, $options: "i" } }
      ];
    }

    const calls = await Call.find(query)
      .populate("user", "email name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Call.countDocuments(query);

    // Calculate totals
    const totalCalls = await Call.countDocuments(query);
    const totalCost = await Call.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$cost" } } }
    ]);
    const totalMinutes = await Call.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$billedMinutes" } } }
    ]);

    res.json({
      success: true,
      calls: calls.map(call => ({
        id: call._id,
        callId: call.telnyxCallId || call.telnyxCallControlId,
        userId: call.user?._id,
        userEmail: call.user?.email,
        userName: call.user?.name,
        phoneNumber: call.phoneNumber,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        direction: call.direction,
        status: call.status,
        callInitiatedAt: call.callInitiatedAt,
        callStartedAt: call.callStartedAt,
        callEndedAt: call.callEndedAt,
        ringingDuration: call.ringingDuration || 0,
        answeredDuration: call.answeredDuration || 0,
        durationSeconds: call.durationSeconds,
        billedMinutes: call.billedMinutes,
        costPerSecond: call.costPerSecond || (call.cost / Math.max(call.durationSeconds, 1)),
        totalCost: call.cost,
        hangupCause: call.hangupCause,
        createdAt: call.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      totals: {
        totalCalls,
        totalCost: totalCost[0]?.total || 0,
        totalMinutes: totalMinutes[0]?.total || 0
      }
    });
  } catch (err) {
    console.error("Admin calls error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch calls"
    });
  }
});

/**
 * GET /api/admin/calls/:id
 * Get single call details
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const call = await Call.findById(req.params.id).populate("user", "email name");

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found"
      });
    }

    res.json({
      success: true,
      call: {
        id: call._id,
        callId: call.telnyxCallId || call.telnyxCallControlId,
        userId: call.user?._id,
        userEmail: call.user?.email,
        userName: call.user?.name,
        phoneNumber: call.phoneNumber,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        direction: call.direction,
        status: call.status,
        callInitiatedAt: call.callInitiatedAt,
        callStartedAt: call.callStartedAt,
        callEndedAt: call.callEndedAt,
        ringingDuration: call.ringingDuration || 0,
        answeredDuration: call.answeredDuration || 0,
        durationSeconds: call.durationSeconds,
        billedMinutes: call.billedMinutes,
        costPerSecond: call.costPerSecond || (call.cost / Math.max(call.durationSeconds, 1)),
        totalCost: call.cost,
        hangupCause: call.hangupCause,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt
      }
    });
  } catch (err) {
    console.error("Admin call detail error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch call details"
    });
  }
});

export default router;
