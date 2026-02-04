import express from "express";
import bcrypt from "bcryptjs";
import authenticateUser from "../../middleware/authenticateUser.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import TelnyxCost from "../../models/TelnyxCost.js";

const router = express.Router();

/**
 * GET /api/admin/users
 * Get all users with pagination and search (ADMIN ONLY)
 */
router.get(
  "/",
  authenticateUser,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const search = req.query.search || "";
      const skip = (page - 1) * limit;

      // Build search query
      let query = {};
      if (search) {
        query = {
          $or: [
            { email: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } }
          ]
        };
      }

      // Get users with pagination
      const [users, total] = await Promise.all([
        User.find(query)
          .select("-password")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(query)
      ]);

      // Get subscription info for each user
      const usersWithSubs = await Promise.all(
        users.map(async (user) => {
          const subscription = await Subscription.findOne({
            userId: user._id,
            status: "active"
          }).lean();

          const phoneNumbers = await PhoneNumber.find({ userId: user._id })
            .select("phoneNumber")
            .lean();

          // Get Telnyx costs breakdown
          const costs = await TelnyxCost.aggregate([
            { $match: { userId: user._id } },
            {
              $group: {
                _id: "$resourceType",
                totalCost: { $sum: "$totalCostUsd" }
              }
            }
          ]);

          // Calculate cost breakdown
          const callCosts = costs.find(c => c._id === "call")?.totalCost || 0;
          const smsCosts = costs.find(c => c._id === "sms")?.totalCost || 0;
          const numberCosts = costs.find(c => c._id === "number")?.totalCost || 0;
          const totalCost = callCosts + smsCosts + numberCosts;

          return {
            ...user,
            id: user._id, // for frontend convenience
            identity: {
              email: user.email,
              name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
              accountStatus: user.status || "active"
            },
            subscriptionStatus: subscription?.status || "none",
            phoneNumbers: phoneNumbers.map(pn => pn.phoneNumber),
            costs: {
              totalTelnyxCost: totalCost,
              telnyxCallCost: callCosts,
              telnyxSmsCost: smsCosts,
              telnyxNumberCost: numberCosts
            }
          };
        })
      );

      res.json({
        success: true,
        users: usersWithSubs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      console.error("Get users error:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);

/**
 * GET /api/admin/users/:id
 * Get a single user by ID (ADMIN ONLY)
 */
router.get(
  "/:id",
  authenticateUser,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select("-password").lean();
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const subscription = await Subscription.findOne({
        userId: user._id,
        status: "active"
      }).lean();

      const phoneNumbers = await PhoneNumber.find({ userId: user._id }).lean();
      const calls = await Call.find({ user: user._id }).lean();
      const sms = await SMS.find({ user: user._id }).lean();

      // Get Telnyx costs
      const costs = await TelnyxCost.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: null,
            totalCost: { $sum: "$totalCostUsd" }
          }
        }
      ]);

      res.json({
        success: true,
        user: {
          ...user,
          subscription: subscription || null,
          phoneNumbers,
          calls,
          sms,
          costs: {
            totalTelnyxCost: costs[0]?.totalCost || 0
          }
        }
      });
    } catch (err) {
      console.error("Get user error:", err);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  }
);

/**
 * POST /api/admin/users
 * Create a new user (ADMIN ONLY)
 */
router.post(
  "/",
  authenticateUser,
  async (req, res) => {
    try {
      const { email, password, name, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: "User with this email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await User.create({
        email,
        password: hashedPassword,
        name: name || "",
        firstName: firstName || "",
        lastName: lastName || ""
      });

      res.json({
        success: true,
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt
        }
      });
    } catch (err) {
      console.error("Create user error:", err);
      res.status(500).json({ error: "Failed to create user" });
    }
  }
);

/**
 * DELETE /api/admin/users/:id
 * Permanently delete a user and all associated data (ADMIN ONLY)
 */
router.delete(
  "/:id",
  authenticateUser,
  async (req, res) => {
    try {
      // TODO: Add admin permission check
      const userId = req.params.id;

      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      // Prevent self-deletion
      if (userId === req.user._id.toString()) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete all associated data
      await Promise.all([
        // Delete subscriptions
        Subscription.deleteMany({ userId }),
        // Delete phone numbers
        PhoneNumber.deleteMany({ userId }),
        // Delete calls
        Call.deleteMany({ user: userId }),
        // Delete SMS
        SMS.deleteMany({ user: userId }),
        // Delete cost records
        TelnyxCost.deleteMany({ userId }),
        // Delete user
        User.findByIdAndDelete(userId)
      ]);

      console.log(`✅ User ${userId} and all associated data deleted by admin ${req.user._id}`);

      res.json({
        success: true,
        message: "User and all associated data deleted permanently"
      });
    } catch (err) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

export default router;
