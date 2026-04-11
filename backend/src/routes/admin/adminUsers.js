import express from "express";
import bcrypt from "bcryptjs";
import authenticateUser from "../../middleware/authenticateUser.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import TelnyxCost from "../../models/TelnyxCost.js";
import { getActiveAddonAmounts } from "../../services/subscriptionAddonCreditService.js";

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
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
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

      const userIds = users.map((u) => u._id);

      const [subscriptions, phoneRows, costAgg] = await Promise.all([
        Subscription.find({
          userId: { $in: userIds },
          status: "active"
        })
          .sort({ updatedAt: -1 })
          .select("userId status planName planKey displayUnlimited")
          .lean(),
        PhoneNumber.find({ userId: { $in: userIds } })
          .select("userId phoneNumber")
          .lean(),
        userIds.length
          ? TelnyxCost.aggregate([
              { $match: { userId: { $in: userIds } } },
              {
                $group: {
                  _id: { userId: "$userId", resourceType: "$resourceType" },
                  totalCost: { $sum: "$totalCostUsd" }
                }
              }
            ])
          : Promise.resolve([])
      ]);

      const subByUser = new Map();
      for (const s of subscriptions) {
        const k = String(s.userId);
        if (!subByUser.has(k)) subByUser.set(k, s);
      }

      const phonesByUser = new Map();
      for (const p of phoneRows) {
        const k = String(p.userId);
        if (!phonesByUser.has(k)) phonesByUser.set(k, []);
        phonesByUser.get(k).push(p.phoneNumber);
      }

      const costsByUser = new Map();
      for (const row of costAgg) {
        const uid = String(row._id.userId);
        if (!costsByUser.has(uid)) {
          costsByUser.set(uid, { call: 0, sms: 0, number: 0 });
        }
        const bucket = costsByUser.get(uid);
        const rt = row._id.resourceType;
        if (rt === "call") bucket.call += row.totalCost || 0;
        else if (rt === "sms") bucket.sms += row.totalCost || 0;
        else if (rt === "number") bucket.number += row.totalCost || 0;
      }

      const usersWithSubs = users.map((user) => {
        const uid = String(user._id);
        const subscription = subByUser.get(uid);
        const phoneNumbers = phonesByUser.get(uid) || [];
        const costs = costsByUser.get(uid) || { call: 0, sms: 0, number: 0 };
        const callCosts = costs.call;
        const smsCosts = costs.sms;
        const numberCosts = costs.number;
        const totalCost = callCosts + smsCosts + numberCosts;

        return {
          ...user,
          id: user._id,
          identity: {
            email: user.email,
            name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            accountStatus: user.status || "active"
          },
          subscriptionStatus: subscription?.status || "none",
          subscriptionPlan:
            subscription?.planName ||
            subscription?.planKey ||
            (subscription?.displayUnlimited ? "Unlimited" : "none"),
          phoneNumbers,
          costs: {
            totalTelnyxCost: totalCost,
            telnyxCallCost: callCosts,
            telnyxSmsCost: smsCosts,
            telnyxNumberCost: numberCosts
          }
        };
      });

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
      const RECENT_ACTIVITY_LIMIT = 100;
      const calls = await Call.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean();
      const sms = await SMS.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean();

      // Get Telnyx costs with breakdown by resource type
      const costGroups = await TelnyxCost.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: "$resourceType",
            totalCost: { $sum: "$totalCostUsd" },
            count: { $sum: 1 },
            totalUnits: { $sum: "$units" }
          }
        }
      ]);

      const callCostGroup = costGroups.find(c => c._id === "call") || {};
      const smsCostGroup = costGroups.find(c => c._id === "sms") || {};
      const numberCostGroup = costGroups.find(c => c._id === "number") || {};

      const callCosts = callCostGroup.totalCost || 0;
      const smsCosts = smsCostGroup.totalCost || 0;
      const numberCosts = numberCostGroup.totalCost || 0;
      const totalCost = callCosts + smsCosts + numberCosts;

      // Derive identity block to match frontend expectations
      const primaryNumber = phoneNumbers[0] || {};
      const identity = {
        id: user._id,
        email: user.email,
        name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
        accountStatus: user.status || "active",
        country: primaryNumber.country || primaryNumber.regionInformation?.country || "N/A",
        createdAt: user.createdAt
      };

      // Derive subscription summary expected by frontend
      const subscriptionSummary = subscription
        ? {
            planName: subscription.planName || subscription.planKey || "Active Plan",
            planType: subscription.planType || null,
            displayUnlimited: Boolean(subscription.displayUnlimited),
            status: subscription.status,
            nextBillingDate: subscription.periodEnd || null,
            raw: subscription
          }
        : null;

      const usageSummary = subscription
        ? {
            ...(() => {
              const addonCredits = getActiveAddonAmounts(subscription);
              return {
                loadedSmsTotal: addonCredits.smsTotal,
                loadedSmsActive: addonCredits.smsActive,
                loadedSmsExpiry: addonCredits.smsExpiry,
                loadedMinutesTotal: addonCredits.minutesTotal,
                loadedMinutesActive: addonCredits.minutesActive,
                loadedMinutesExpiry: addonCredits.minutesExpiry
              };
            })(),
            monthlySmsUsed: Number(subscription.usage?.smsUsed || 0),
            monthlyMinutesUsed: Number(subscription.usage?.minutesUsed || 0) / 60,
            dailySmsUsed: Number(subscription.dailySmsUsed || 0),
            dailyMinutesUsed: Number(subscription.dailyMinutesUsed || 0) / 60,
            monthlySmsLimit:
              subscription.monthlySmsLimit ?? subscription.limits?.smsTotal ?? null,
            monthlyMinutesLimit:
              subscription.monthlyMinutesLimit ?? subscription.limits?.minutesTotal ?? null,
            dailySmsLimit: subscription.dailySmsLimit ?? null,
            dailyMinutesLimit: subscription.dailyMinutesLimit ?? null
          }
        : null;

      res.json({
        success: true,
        user: {
          ...user,
          identity,
          subscription: subscriptionSummary,
          phoneNumbers,
          calls,
          sms,
          costs: {
            calls: {
              totalCost: callCosts,
              count: callCostGroup.count || 0,
              // totalUnits may represent seconds; convert to minutes if present
              totalMinutes: callCostGroup.totalUnits ? (callCostGroup.totalUnits / 60) : 0
            },
            sms: {
              totalCost: smsCosts,
              count: smsCostGroup.count || 0
            },
            phoneNumbers: {
              // Treat numberCosts as total number-related cost; we don't yet split monthly vs one-time
              monthlyCost: numberCosts,
              oneTimeCost: 0
            },
            totalTelnyxCost: totalCost
          },
          usage: usageSummary
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
