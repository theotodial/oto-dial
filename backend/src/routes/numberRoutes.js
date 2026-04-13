import express from "express";
import PhoneNumber from "../models/PhoneNumber.js";

const router = express.Router();

/**
 * GET /api/numbers
 * Returns all phone numbers for the authenticated user with full details
 */
router.get(
  "/",
  async (req, res) => {
    try {
      // Fetch actual PhoneNumber documents from database to get all fields
      const phoneNumbers = await PhoneNumber.find({
        userId: req.userId || req.user?._id,
        status: "active"
      })
        .sort({ purchaseDate: -1, createdAt: -1 })
        .select("phoneNumber status country state city regionInformation purchaseDate createdAt monthlyCost oneTimeFees carrierGroup")
        .lean();

      // Format the response to include all relevant fields
      const formattedNumbers = phoneNumbers.map(num => ({
        _id: num._id,
        id: num._id,
        number: num.phoneNumber,
        phoneNumber: num.phoneNumber,
        status: num.status,
        country: num.country,
        state: num.state,
        city: num.city,
        regionInformation: num.regionInformation,
        purchaseDate: num.purchaseDate,
        createdAt: num.createdAt,
        created_at: num.createdAt,
        monthlyCost: num.monthlyCost,
        oneTimeFees: num.oneTimeFees,
        carrierGroup: num.carrierGroup
      }));

      res.json({
        success: true,
        numbers: formattedNumbers
      });
    } catch (err) {
      console.error("Error fetching numbers:", err);
      res.status(500).json({
        success: false,
        error: "Failed to fetch numbers"
      });
    }
  }
);

export default router;
