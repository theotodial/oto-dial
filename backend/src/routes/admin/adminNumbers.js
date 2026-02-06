import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import User from "../../models/User.js";

const router = express.Router();

/**
 * GET /api/admin/numbers
 * Get all phone numbers with cost details
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search, 
      userId, 
      status,
      carrierGroup
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};

    if (userId) {
      query.userId = userId;
    }

    if (status) {
      query.status = status;
    }

    if (carrierGroup) {
      query.carrierGroup = carrierGroup;
    }

    if (search) {
      query.$or = [
        { phoneNumber: { $regex: search, $options: "i" } },
        { telnyxPhoneNumberId: { $regex: search, $options: "i" } }
      ];
    }

    const numbers = await PhoneNumber.find(query)
      .populate("userId", "email name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PhoneNumber.countDocuments(query);

    // Calculate totals
    const totalNumbers = await PhoneNumber.countDocuments(query);
    const totalMonthlyCost = await PhoneNumber.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$monthlyCost" } } }
    ]);
    const totalOneTimeFees = await PhoneNumber.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$oneTimeFees" } } }
    ]);

    res.json({
      success: true,
      numbers: numbers.map(num => ({
        id: num._id,
        telnyxNumberId: num.telnyxPhoneNumberId,
        phoneNumber: num.phoneNumber,
        userId: num.userId?._id,
        userEmail: num.userId?.email,
        userName: num.userId?.name,
        status: num.status,
        monthlyCost: num.monthlyCost || 0,
        oneTimeFees: num.oneTimeFees || 0,
        carrierGroup: num.carrierGroup,
        extraFees: num.extraFees || 0,
        purchaseDate: num.purchaseDate || num.createdAt,
        createdAt: num.createdAt,
        // Country metadata for admin visibility
        country: num.country || null,
        countryCode: num.countryCode || null,
        countryName: num.countryName || null,
        iso2: num.iso2 || null,
        lockedCountry: num.lockedCountry !== false
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      totals: {
        totalNumbers,
        totalMonthlyCost: totalMonthlyCost[0]?.total || 0,
        totalOneTimeFees: totalOneTimeFees[0]?.total || 0
      }
    });
  } catch (err) {
    console.error("Admin numbers error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch numbers"
    });
  }
});

/**
 * GET /api/admin/numbers/:id
 * Get single number details
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const number = await PhoneNumber.findById(req.params.id).populate("userId", "email name");

    if (!number) {
      return res.status(404).json({
        success: false,
        error: "Phone number not found"
      });
    }

    res.json({
      success: true,
      number: {
        id: number._id,
        telnyxNumberId: number.telnyxPhoneNumberId,
        phoneNumber: number.phoneNumber,
        userId: number.userId?._id,
        userEmail: number.userId?.email,
        userName: number.userId?.name,
        status: number.status,
        monthlyCost: number.monthlyCost || 0,
        oneTimeFees: number.oneTimeFees || 0,
        carrierGroup: number.carrierGroup,
        extraFees: number.extraFees || 0,
        purchaseDate: number.purchaseDate || number.createdAt,
        messagingProfileId: number.messagingProfileId,
        createdAt: number.createdAt,
        updatedAt: number.updatedAt,
        // Country metadata for admin visibility
        country: number.country || null,
        countryCode: number.countryCode || null,
        countryName: number.countryName || null,
        iso2: number.iso2 || null,
        lockedCountry: number.lockedCountry !== false
      }
    });
  } catch (err) {
    console.error("Admin number detail error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch number details"
    });
  }
});

export default router;
