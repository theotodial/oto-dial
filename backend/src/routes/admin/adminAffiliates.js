import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Affiliate from "../../models/Affiliate.js";
import AffiliateReferral from "../../models/AffiliateReferral.js";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import { applyPlanSnapshotToSubscription } from "../../services/subscriptionPlanSnapshotService.js";
import { createAdminNotification } from "../../services/adminNotificationService.js";
import { ensureAffiliateUnlimitedPlan, markAffiliateReferralPaid } from "../../services/affiliateService.js";

const router = express.Router();

function serializeAffiliate(affiliate, statsMap = new Map()) {
  const stats = statsMap.get(affiliate._id.toString()) || { total: 0, paid: 0 };
  return {
    id: affiliate._id,
    email: affiliate.email,
    name: affiliate.name,
    firstName: affiliate.firstName,
    lastName: affiliate.lastName,
    phone: affiliate.phone,
    status: affiliate.status,
    affiliateCode: affiliate.affiliateCode,
    approvedAt: affiliate.approvedAt,
    approvedBy: affiliate.approvedBy,
    rejectionReason: affiliate.rejectionReason || null,
    createdAt: affiliate.createdAt,
    updatedAt: affiliate.updatedAt,
    stats: {
      totalReferrals: stats.total,
      paidReferrals: stats.paid
    }
  };
}

async function buildReferralStatsMap(affiliateIds = []) {
  if (!affiliateIds.length) {
    return new Map();
  }

  const grouped = await AffiliateReferral.aggregate([
    {
      $match: {
        affiliateId: { $in: affiliateIds }
      }
    },
    {
      $group: {
        _id: "$affiliateId",
        total: { $sum: 1 },
        paid: {
          $sum: {
            $cond: [{ $eq: ["$status", "paid"] }, 1, 0]
          }
        }
      }
    }
  ]);

  const map = new Map();
  grouped.forEach((entry) => {
    map.set(String(entry._id), {
      total: entry.total || 0,
      paid: entry.paid || 0
    });
  });
  return map;
}

router.get("/affiliates", requireAdmin, async (req, res) => {
  try {
    const { status = "", search = "" } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { affiliateCode: { $regex: search, $options: "i" } }
      ];
    }

    const affiliates = await Affiliate.find(query)
      .populate("approvedBy", "email name")
      .sort({ createdAt: -1 });

    const statsMap = await buildReferralStatsMap(affiliates.map((item) => item._id));

    return res.json({
      success: true,
      affiliates: affiliates.map((affiliate) => serializeAffiliate(affiliate, statsMap))
    });
  } catch (err) {
    console.error("ADMIN AFFILIATES LIST ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch affiliates"
    });
  }
});

router.get("/affiliates/:id/users", requireAdmin, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.id).lean();
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: "Affiliate not found"
      });
    }

    const referrals = await AffiliateReferral.find({ affiliateId: affiliate._id })
      .populate({
        path: "userId",
        select: "email name createdAt activeSubscriptionId referredByAffiliate",
        match: {
          referredByAffiliate: affiliate._id
        }
      })
      .sort({ createdAt: -1 });

    const filteredReferrals = referrals.filter(
      (item) =>
        Boolean(item.userId) &&
        String(item.userId.referredByAffiliate || "") === String(affiliate._id)
    );

    const userIds = filteredReferrals.map((item) => item.userId?._id).filter(Boolean);
    const subscriptions = await Subscription.find({
      userId: { $in: userIds },
      status: { $in: ["active", "suspended", "pending_activation", "cancelled"] }
    }).sort({ updatedAt: -1 });

    const latestByUser = new Map();
    subscriptions.forEach((subscription) => {
      const key = subscription.userId.toString();
      if (!latestByUser.has(key)) {
        latestByUser.set(key, subscription);
      }
    });

    return res.json({
      success: true,
      users: filteredReferrals.map((referral) => {
        const user = referral.userId;
        const subscription = user
          ? latestByUser.get(user._id.toString()) || null
          : null;

        return {
          referralId: referral._id,
          userId: user?._id || null,
          email: user?.email || referral.userEmail || "",
          name: user?.name || "",
          referralStatus: referral.status,
          signupSource: referral.source,
          createdAt: referral.createdAt,
          convertedAt: referral.convertedAt,
          subscription: subscription
            ? {
                id: subscription._id,
                status: subscription.status,
                planName: subscription.planName
              }
            : null
        };
      })
    });
  } catch (err) {
    console.error("ADMIN AFFILIATE USERS ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch affiliate users"
    });
  }
});

router.post("/affiliates/:id/approve", requireAdmin, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: "Affiliate not found"
      });
    }

    affiliate.status = "approved";
    affiliate.approvedAt = new Date();
    affiliate.approvedBy = req.userId;
    affiliate.rejectionReason = null;
    await affiliate.save();

    await createAdminNotification({
      type: "system",
      title: "Affiliate approved",
      message: `${affiliate.email} was approved by admin`,
      sourceModel: "Affiliate",
      sourceId: affiliate._id
    });

    return res.json({
      success: true,
      message: "Affiliate approved successfully"
    });
  } catch (err) {
    console.error("ADMIN APPROVE AFFILIATE ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to approve affiliate"
    });
  }
});

router.post("/affiliates/:id/reject", requireAdmin, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.params.id);
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: "Affiliate not found"
      });
    }

    const reason = String(req.body?.reason || "").trim();
    affiliate.status = "rejected";
    affiliate.rejectionReason = reason || null;
    affiliate.approvedAt = null;
    affiliate.approvedBy = null;
    await affiliate.save();

    return res.json({
      success: true,
      message: "Affiliate rejected successfully"
    });
  } catch (err) {
    console.error("ADMIN REJECT AFFILIATE ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to reject affiliate"
    });
  }
});

router.post("/affiliates/:id/users/:userId/assign-unlimited", requireAdmin, async (req, res) => {
  try {
    const { id, userId } = req.params;

    const affiliate = await Affiliate.findById(id);
    if (!affiliate) {
      return res.status(404).json({
        success: false,
        error: "Affiliate not found"
      });
    }

    const referral = await AffiliateReferral.findOne({
      affiliateId: affiliate._id,
      userId
    });
    if (!referral) {
      return res.status(400).json({
        success: false,
        error: "User is not linked to this affiliate"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    if (String(user.referredByAffiliate || "") !== String(affiliate._id)) {
      return res.status(400).json({
        success: false,
        error: "User is not linked to this affiliate"
      });
    }

    const plan = await ensureAffiliateUnlimitedPlan();

    await Subscription.updateMany(
      { userId: user._id, status: { $in: ["active", "pending_activation"] } },
      { $set: { status: "cancelled" } }
    );

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = new Subscription({
      userId: user._id,
      planId: plan._id,
      stripePriceId: plan.stripePriceId,
      planName: plan.name,
      planKey: plan.type,
      status: "active",
      periodStart: now,
      periodEnd,
      usage: {
        minutesUsed: 0,
        smsUsed: 0
      },
      limits: {
        minutesTotal: plan.limits?.minutesTotal || 0,
        smsTotal: plan.limits?.smsTotal || 0,
        numbersTotal: plan.limits?.numbersTotal || 1
      },
      hardStop: true,
      ratePerMinute: 0.0065
    });

    applyPlanSnapshotToSubscription(subscription, plan);
    await subscription.save();

    user.activeSubscriptionId = subscription._id;
    user.subscriptionActive = true;
    user.currentPlanId = plan._id;
    user.currentSubscriptionLimits = {
      minutesTotal: subscription.limits.minutesTotal,
      smsTotal: subscription.limits.smsTotal,
      numbersTotal: subscription.limits.numbersTotal
    };
    user.lastSubscriptionSyncAt = new Date();
    await user.save();

    await markAffiliateReferralPaid({
      userId: user._id,
      subscriptionId: subscription._id
    });

    return res.json({
      success: true,
      message: "Affiliate unlimited plan assigned successfully"
    });
  } catch (err) {
    console.error("ADMIN ASSIGN AFFILIATE PLAN ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to assign affiliate plan"
    });
  }
});

export default router;
