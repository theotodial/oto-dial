import express from "express";
import bcrypt from "bcryptjs";
import authenticateUser from "../../middleware/authenticateUser.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import TelnyxCost from "../../models/TelnyxCost.js";
import CustomPackage from "../../models/CustomPackage.js";
import { getActiveAddonAmounts } from "../../services/subscriptionAddonCreditService.js";
import {
  clearAdminUsersCache,
  readAdminUsersCache,
  writeAdminUsersCache,
} from "../../services/adminUsersCacheService.js";
import {
  applyCustomPackageToSubscription,
  getActiveCustomPackage,
} from "../../services/customPackageService.js";
import {
  buildPublicSubscriptionState,
  loadUserSubscription,
} from "../../services/subscriptionService.js";
import { normalizeFeatures } from "../../utils/userFeatures.js";

const router = express.Router();

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAdminUserListQuery(search = "") {
  const trimmed = String(search || "").trim();
  if (!trimmed) return {};
  if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
    return { _id: trimmed };
  }
  const anchored = new RegExp(`^${escapeRegex(trimmed)}`, "i");
  return {
    $or: [
      { email: anchored },
      { name: anchored },
      { firstName: anchored },
      { lastName: anchored },
    ],
  };
}

function buildAdminUserFilterMatch(filter = "all") {
  const normalized = String(filter || "all").trim().toLowerCase();

  if (normalized === "active") {
    return {
      $or: [
        {
          subscription: { $ne: null },
          "subscription.status": { $ne: "cancelled" },
        },
        { customPackage: { $ne: null } },
      ],
    };
  }

  if (normalized === "no_subscription") {
    return {
      subscription: null,
      customPackage: null,
      status: { $nin: ["suspended", "banned"] },
    };
  }

  if (normalized === "blocked") {
    return {
      status: { $in: ["suspended", "banned"] },
    };
  }

  return null;
}

function buildUsageSummary(subscription) {
  if (!subscription) return null;
  const addonCredits = getActiveAddonAmounts(subscription);
  return {
    loadedSmsTotal: addonCredits.smsTotal,
    loadedSmsActive: addonCredits.smsActive,
    loadedSmsExpiry: addonCredits.smsExpiry,
    loadedMinutesTotal: addonCredits.minutesTotal,
    loadedMinutesActive: addonCredits.minutesActive,
    loadedMinutesExpiry: addonCredits.minutesExpiry,
    monthlySmsUsed: Number(subscription.smsUsed ?? subscription.usage?.smsUsed ?? 0),
    monthlyMinutesUsed:
      Number(
        subscription.minutesUsed ??
          Number(subscription.usage?.minutesUsed || 0) / 60
      ),
    dailySmsUsed: Number(subscription.dailySmsUsed || 0),
    dailyMinutesUsed: Number(subscription.dailyMinutesUsed || 0) / 60,
    monthlySmsLimit:
      subscription.monthlySmsLimit ?? subscription.smsLimit ?? subscription.limits?.smsTotal ?? null,
    monthlyMinutesLimit:
      subscription.monthlyMinutesLimit ?? subscription.minutesLimit ?? subscription.limits?.minutesTotal ?? null,
    dailySmsLimit: subscription.dailySmsLimit ?? null,
    dailyMinutesLimit: subscription.dailyMinutesLimit ?? null,
  };
}

function buildSubscriptionFromLookup(subscription, customPackage) {
  if (!subscription && !customPackage) {
    return null;
  }

  return buildPublicSubscriptionState(
    applyCustomPackageToSubscription(
      subscription
        ? {
            _id: subscription._id,
            id: subscription._id,
            active:
              subscription.status === "active" ||
              subscription.status === "trialing" ||
              subscription.status === "pending_activation" ||
              subscription.status === "past_due",
            status: subscription.status,
            planName: subscription.planName || subscription.planKey || "Active Plan",
            planType: subscription.planType || null,
            displayUnlimited: Boolean(subscription.displayUnlimited),
            isUnlimited: Boolean(subscription.displayUnlimited),
            minutesRemaining: Math.max(
              0,
              Number(subscription.limits?.minutesTotal || 0) -
                Number(subscription.usage?.minutesUsed || 0) / 60
            ),
            smsRemaining: Math.max(
              0,
              Number(subscription.limits?.smsTotal || 0) -
                Number(subscription.usage?.smsUsed || 0)
            ),
            usage: subscription.usage,
            limits: subscription.limits,
            periodStart: subscription.periodStart || null,
            periodEnd: subscription.periodEnd || null,
          }
        : null,
      customPackage
    )
  );
}

async function loadEffectiveSubscriptionForAdmin(userId) {
  const [subscriptionDoc, customPackage] = await Promise.all([
    Subscription.findOne({
      userId,
    })
      .sort({ createdAt: -1 })
      .lean(),
    getActiveCustomPackage(userId),
  ]);

  if (!subscriptionDoc && !customPackage) {
    return { subscriptionDoc: null, customPackage: null, effectiveSubscription: null };
  }

  const effectiveSubscription = buildPublicSubscriptionState(
    applyCustomPackageToSubscription(
      subscriptionDoc
        ? {
            _id: subscriptionDoc._id,
            id: subscriptionDoc._id,
            active:
              subscriptionDoc.status === "active" ||
              subscriptionDoc.status === "trialing" ||
              subscriptionDoc.status === "pending_activation" ||
              subscriptionDoc.status === "past_due",
            status: subscriptionDoc.status,
            planName: subscriptionDoc.planName || subscriptionDoc.planKey || "Active Plan",
            planType: subscriptionDoc.planType || null,
            displayUnlimited: Boolean(subscriptionDoc.displayUnlimited),
            isUnlimited: Boolean(subscriptionDoc.displayUnlimited),
            minutesRemaining: Math.max(
              0,
              Number(subscriptionDoc.limits?.minutesTotal || 0) -
                Number(subscriptionDoc.usage?.minutesUsed || 0) / 60
            ),
            smsRemaining: Math.max(
              0,
              Number(subscriptionDoc.limits?.smsTotal || 0) -
                Number(subscriptionDoc.usage?.smsUsed || 0)
            ),
            usage: subscriptionDoc.usage,
            limits: subscriptionDoc.limits,
            periodStart: subscriptionDoc.periodStart || null,
            periodEnd: subscriptionDoc.periodEnd || null,
          }
        : null,
      customPackage
    )
  );

  return { subscriptionDoc, customPackage, effectiveSubscription };
}

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
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 20);
      const search = req.query.search || "";
      const filter = String(req.query.filter || "all").trim().toLowerCase();
      const skip = (page - 1) * limit;
      const query = buildAdminUserListQuery(search);
      const filterMatch = buildAdminUserFilterMatch(filter);
      const cacheKey = JSON.stringify({
        page,
        limit,
        filter,
        search: String(search || "").trim().toLowerCase(),
      });
      const cached = readAdminUsersCache(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const basePipeline = [
        { $match: query },
        {
          $lookup: {
            from: "subscriptions",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$userId", "$$userId"] }
                }
              },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 1,
                  userId: 1,
                  status: 1,
                  planName: 1,
                  planKey: 1,
                  planType: 1,
                  displayUnlimited: 1,
                  limits: 1,
                  usage: 1,
                  periodStart: 1,
                  periodEnd: 1
                }
              }
            ],
            as: "subscription"
          }
        },
        {
          $lookup: {
            from: "custompackages",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$userId", "$$userId"] },
                  active: true,
                  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
                }
              },
              { $sort: { updatedAt: -1, createdAt: -1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 1,
                  userId: 1,
                  minutesAllowed: 1,
                  smsAllowed: 1,
                  expiresAt: 1,
                  isCallEnabled: 1,
                  isSmsEnabled: 1,
                  allowedCountries: 1,
                  blockedCountries: 1,
                  overridePlan: 1,
                  active: 1
                }
              }
            ],
            as: "customPackage"
          }
        },
        {
          $project: {
            _id: 1,
            email: 1,
            name: 1,
            firstName: 1,
            lastName: 1,
            status: 1,
            isEmailVerified: 1,
            createdAt: 1,
            subscription: { $arrayElemAt: ["$subscription", 0] },
            customPackage: { $arrayElemAt: ["$customPackage", 0] }
          }
        }
      ];

      if (filterMatch) {
        basePipeline.push({ $match: filterMatch });
      }

      const [users, totalRows] = await Promise.all([
        User.aggregate([
          ...basePipeline,
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
        ]),
        User.aggregate([
          ...basePipeline,
          { $count: "total" },
        ]),
      ]);

      const total = Number(totalRows[0]?.total || 0);

      const usersWithSubs = users.map((user) => {
        const effectiveSubscription = buildSubscriptionFromLookup(
          user.subscription || null,
          user.customPackage || null
        );

        return {
          _id: user._id,
          id: user._id,
          email: user.email,
          name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
          status: user.status || "active",
          isEmailVerified: user.isEmailVerified !== false,
          createdAt: user.createdAt,
          subscription: effectiveSubscription,
          customPackage: user.customPackage || null,
          usage: {
            minutesUsed: Number(user.subscription?.usage?.minutesUsed || 0) / 60,
            smsUsed: Number(user.subscription?.usage?.smsUsed || 0),
          },
          subscriptionStatus: effectiveSubscription?.status || "none",
          subscriptionPlan: effectiveSubscription?.planName || "none",
        };
      });

      const payload = {
        success: true,
        users: usersWithSubs,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit))
        },
      };
      writeAdminUsersCache(cacheKey, payload);
      res.json(payload);
    } catch (err) {
      console.error("Get users error:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);

router.get(
  "/:id/details",
  authenticateUser,
  async (req, res) => {
    try {
      const [user, effectiveSubscription, recentCalls, recentMessages] = await Promise.all([
        User.findById(req.params.id)
          .select("_id email name firstName lastName status createdAt isEmailVerified features")
          .lean(),
        loadUserSubscription(req.params.id),
        Call.find({ user: req.params.id })
          .select("phoneNumber fromNumber toNumber direction status createdAt duration")
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),
        SMS.find({ user: req.params.id })
          .select("to from phoneNumber text body status createdAt")
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
      ]);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const [phoneNumbers, costs] = await Promise.all([
        PhoneNumber.find({ userId: user._id })
          .select("phoneNumber status monthlyCost carrierGroup country regionInformation")
          .lean(),
        TelnyxCost.aggregate([
          { $match: { userId: user._id } },
          {
            $group: {
              _id: "$resourceType",
              totalCost: { $sum: "$totalCostUsd" },
              count: { $sum: 1 },
              totalUnits: { $sum: "$units" }
            }
          }
        ]),
      ]);

      const callCostGroup = costs.find((c) => c._id === "call") || {};
      const smsCostGroup = costs.find((c) => c._id === "sms") || {};
      const numberCostGroup = costs.find((c) => c._id === "number") || {};
      const primaryNumber = phoneNumbers[0] || {};
      const usage = buildUsageSummary(effectiveSubscription);

      return res.json({
        success: true,
        user: {
          _id: user._id,
          id: user._id,
          email: user.email,
          status: user.status || "active",
          isEmailVerified: user.isEmailVerified !== false,
          createdAt: user.createdAt,
          features: normalizeFeatures(user),
          identity: {
            id: user._id,
            email: user.email,
            name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            accountStatus: user.status || "active",
            country: primaryNumber.country || primaryNumber.regionInformation?.country || "N/A",
            createdAt: user.createdAt,
            isEmailVerified: user.isEmailVerified !== false,
          },
          phoneNumbers,
        },
        hasSubscriptionDocument: Boolean(effectiveSubscription),
        subscription: effectiveSubscription,
        customPackage: effectiveSubscription?.customPackage || null,
        usage,
        recentCalls,
        recentMessages,
        costs: {
          calls: {
            totalCost: callCostGroup.totalCost || 0,
            count: callCostGroup.count || 0,
            totalMinutes: callCostGroup.totalUnits ? (callCostGroup.totalUnits / 60) : 0
          },
          sms: {
            totalCost: smsCostGroup.totalCost || 0,
            count: smsCostGroup.count || 0
          },
          phoneNumbers: {
            monthlyCost: numberCostGroup.totalCost || 0,
            oneTimeCost: 0
          },
          totalTelnyxCost:
            (callCostGroup.totalCost || 0) +
            (smsCostGroup.totalCost || 0) +
            (numberCostGroup.totalCost || 0)
        },
      });
    } catch (err) {
      console.error("Get user details error:", err);
      return res.status(500).json({ error: "Failed to fetch user details" });
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

      const subscription = await loadUserSubscription(user._id);

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
            planName: subscription.planName || subscription.planKey || "No Plan",
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

      clearAdminUsersCache();

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

      clearAdminUsersCache();

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
