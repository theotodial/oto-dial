import express from "express";
import { getStripe } from "../../config/stripe.js";
import authenticateAffiliate from "../middleware/authenticateAffiliate.js";
import AffiliateReferral from "../models/AffiliateReferral.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { ensureAffiliateUnlimitedPlan, resolveFrontendUrl } from "../services/affiliateService.js";
import { markAffiliateReferralPaid } from "../services/affiliateService.js";

const router = express.Router();

router.use(authenticateAffiliate);

function mapAffiliate(affiliate, req) {
  return {
    id: affiliate._id,
    email: affiliate.email,
    name: affiliate.name,
    firstName: affiliate.firstName,
    lastName: affiliate.lastName,
    status: affiliate.status,
    affiliateCode: affiliate.affiliateCode,
    referralLink: `${resolveFrontendUrl(req)}/signup?ref=${encodeURIComponent(
      affiliate.affiliateCode
    )}`
  };
}

async function getLatestSubscriptionsForUsers(userIds = []) {
  if (!userIds.length) {
    return new Map();
  }

  const subscriptions = await Subscription.find({
    userId: { $in: userIds },
    status: {
      $in: ["active", "suspended", "pending_activation", "past_due", "cancelled"]
    }
  }).sort({ updatedAt: -1 });

  const latestByUser = new Map();
  subscriptions.forEach((subscription) => {
    const key = subscription.userId.toString();
    if (!latestByUser.has(key)) {
      latestByUser.set(key, subscription);
    }
  });
  return latestByUser;
}

async function assertReferredUser(affiliateId, userId) {
  const referral = await AffiliateReferral.findOne({
    affiliateId,
    userId
  });
  if (!referral) {
    return null;
  }

  const user = await User.findOne({
    _id: userId,
    referredByAffiliate: affiliateId
  }).select("_id");

  if (!user) {
    return null;
  }

  return referral;
}

router.get("/me", async (req, res) => {
  return res.json({
    success: true,
    affiliate: mapAffiliate(req.affiliate, req)
  });
});

router.get("/users", async (req, res) => {
  try {
    const referrals = await AffiliateReferral.find({ affiliateId: req.affiliateId })
      .populate({
        path: "userId",
        select: "email name createdAt activeSubscriptionId referredByAffiliate",
        match: {
          referredByAffiliate: req.affiliateId
        }
      })
      .sort({ createdAt: -1 });

    const filteredReferrals = referrals.filter(
      (entry) =>
        Boolean(entry.userId) &&
        String(entry.userId.referredByAffiliate || "") === String(req.affiliateId)
    );

    const userIds = filteredReferrals
      .map((entry) => entry.userId?._id)
      .filter(Boolean);
    const latestSubscriptions = await getLatestSubscriptionsForUsers(userIds);

    const users = filteredReferrals.map((referral) => {
      const user = referral.userId;
      const subscription = user
        ? latestSubscriptions.get(user._id.toString()) || null
        : null;

      return {
        referralId: referral._id,
        userId: user?._id || null,
        email: user?.email || referral.userEmail || "",
        name: user?.name || "",
        signupSource: referral.source,
        referralStatus: referral.status,
        signupAt: referral.createdAt,
        convertedAt: referral.convertedAt,
        subscription: subscription
          ? {
              id: subscription._id,
              status: subscription.status,
              planName: subscription.planName || null,
              stripeSubscriptionId: subscription.stripeSubscriptionId || null,
              periodStart: subscription.periodStart,
              periodEnd: subscription.periodEnd
            }
          : null
      };
    });

    const paidCount = users.filter((item) => item.referralStatus === "paid").length;

    return res.json({
      success: true,
      affiliate: mapAffiliate(req.affiliate, req),
      stats: {
        totalReferredUsers: users.length,
        paidUsers: paidCount,
        pendingUsers: users.length - paidCount
      },
      users
    });
  } catch (err) {
    console.error("AFFILIATE USERS ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch affiliate users"
    });
  }
});

router.post("/users/:userId/checkout-unlimited", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ success: false, error: "Stripe not configured" });
  }

  try {
    const { userId } = req.params;
    const referral = await assertReferredUser(req.affiliateId, userId);
    if (!referral) {
      return res.status(403).json({
        success: false,
        error: "This user is not linked to your affiliate account"
      });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: "Referred user not found"
      });
    }

    const affiliatePlan = await ensureAffiliateUnlimitedPlan();

    let customerId = targetUser.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: targetUser.email,
        metadata: {
          userId: targetUser._id.toString(),
          affiliateId: req.affiliateId.toString()
        }
      });
      customerId = customer.id;
      targetUser.stripeCustomerId = customerId;
      await targetUser.save();
    }

    const frontend = resolveFrontendUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: affiliatePlan.stripePriceId,
          quantity: 1
        }
      ],
      success_url: `${frontend}/affiliate/dashboard?payment=success`,
      cancel_url: `${frontend}/affiliate/dashboard?payment=cancel`,
      subscription_data: {
        metadata: {
          userId: targetUser._id.toString(),
          planId: affiliatePlan._id.toString(),
          planName: affiliatePlan.name,
          planType: affiliatePlan.type,
          purchaseType: "affiliate_subscription",
          affiliateId: req.affiliateId.toString()
        }
      },
      metadata: {
        userId: targetUser._id.toString(),
        planId: affiliatePlan._id.toString(),
        planName: affiliatePlan.name,
        planType: affiliatePlan.type,
        purchaseType: "affiliate_subscription",
        affiliateId: req.affiliateId.toString()
      }
    });

    return res.json({
      success: true,
      url: session.url
    });
  } catch (err) {
    console.error("AFFILIATE CHECKOUT ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to start checkout"
    });
  }
});

router.post("/users/:userId/subscription/pause", async (req, res) => {
  try {
    const { userId } = req.params;
    const referral = await assertReferredUser(req.affiliateId, userId);
    if (!referral) {
      return res.status(403).json({
        success: false,
        error: "This user is not linked to your affiliate account"
      });
    }

    const subscription = await Subscription.findOne({
      userId,
      status: "active"
    }).sort({ updatedAt: -1 });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "No active subscription found for this user"
      });
    }

    subscription.status = "suspended";
    await subscription.save();

    return res.json({
      success: true,
      message: "Subscription paused successfully"
    });
  } catch (err) {
    console.error("AFFILIATE PAUSE SUBSCRIPTION ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to pause subscription"
    });
  }
});

router.post("/users/:userId/subscription/resume", async (req, res) => {
  try {
    const { userId } = req.params;
    const referral = await assertReferredUser(req.affiliateId, userId);
    if (!referral) {
      return res.status(403).json({
        success: false,
        error: "This user is not linked to your affiliate account"
      });
    }

    const subscription = await Subscription.findOne({
      userId,
      status: "suspended"
    }).sort({ updatedAt: -1 });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: "No suspended subscription found for this user"
      });
    }

    subscription.status = "active";
    await subscription.save();

    if (!subscription.stripeSubscriptionId) {
      await markAffiliateReferralPaid({
        userId: subscription.userId,
        subscriptionId: subscription._id
      });
    }

    return res.json({
      success: true,
      message: "Subscription resumed successfully"
    });
  } catch (err) {
    console.error("AFFILIATE RESUME SUBSCRIPTION ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to resume subscription"
    });
  }
});

export default router;
