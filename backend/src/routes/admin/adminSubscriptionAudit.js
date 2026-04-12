import express from "express";
import Stripe from "stripe";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import requireAdmin from "../../middleware/requireAdmin.js";

const router = express.Router();
router.use(requireAdmin);

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/**
 * GET /api/admin/subscriptions/audit
 * Audit endpoint to find subscription mismatches
 */
router.get("/", async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured" });
    }

    const issues = {
      paidButInactive: [],
      activeWithoutPayment: [],
      stripeMongoMismatches: [],
      orphanedSubscriptions: [],
      usersWithoutStripeCustomer: []
    };

    // Find all users with Stripe customer IDs
    const users = await User.find({ stripeCustomerId: { $exists: true, $ne: null } });

    for (const user of users) {
      try {
        // Fetch Stripe subscriptions
        const stripeSubscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          limit: 100
        });

        // Check for paid but inactive subscriptions
        for (const stripeSub of stripeSubscriptions.data) {
          if (stripeSub.status === "active") {
            const mongoSub = await Subscription.findOne({
              stripeSubscriptionId: stripeSub.id
            });

            if (!mongoSub) {
              issues.orphanedSubscriptions.push({
                userId: user._id,
                userEmail: user.email,
                stripeSubscriptionId: stripeSub.id,
                stripeStatus: stripeSub.status,
                issue: "Stripe subscription exists but no MongoDB record"
              });
            } else if (mongoSub.status !== "active") {
              issues.paidButInactive.push({
                userId: user._id,
                userEmail: user.email,
                subscriptionId: mongoSub._id,
                stripeSubscriptionId: stripeSub.id,
                stripeStatus: stripeSub.status,
                mongoStatus: mongoSub.status,
                issue: "Stripe shows active but MongoDB shows inactive"
              });
            }

            // Check if user has activeSubscriptionId set
            if (!user.activeSubscriptionId || user.activeSubscriptionId.toString() !== mongoSub?._id.toString()) {
              issues.stripeMongoMismatches.push({
                userId: user._id,
                userEmail: user.email,
                stripeSubscriptionId: stripeSub.id,
                userActiveSubscriptionId: user.activeSubscriptionId,
                mongoSubscriptionId: mongoSub?._id,
                issue: "User activeSubscriptionId doesn't match Stripe subscription"
              });
            }
          }
        }

        // Check MongoDB subscriptions without Stripe
        const mongoSubscriptions = await Subscription.find({
          userId: user._id,
          status: "active"
        });

        for (const mongoSub of mongoSubscriptions) {
          if (mongoSub.stripeSubscriptionId) {
            try {
              const stripeSub = await stripe.subscriptions.retrieve(mongoSub.stripeSubscriptionId);
              if (stripeSub.status !== "active") {
                issues.activeWithoutPayment.push({
                  userId: user._id,
                  userEmail: user.email,
                  subscriptionId: mongoSub._id,
                  stripeSubscriptionId: mongoSub.stripeSubscriptionId,
                  mongoStatus: mongoSub.status,
                  stripeStatus: stripeSub.status,
                  issue: "MongoDB shows active but Stripe shows inactive"
                });
              }
            } catch (err) {
              if (err.code === "resource_missing") {
                issues.activeWithoutPayment.push({
                  userId: user._id,
                  userEmail: user.email,
                  subscriptionId: mongoSub._id,
                  stripeSubscriptionId: mongoSub.stripeSubscriptionId,
                  mongoStatus: mongoSub.status,
                  issue: "MongoDB subscription references non-existent Stripe subscription"
                });
              }
            }
          } else {
            issues.activeWithoutPayment.push({
              userId: user._id,
              userEmail: user.email,
              subscriptionId: mongoSub._id,
              mongoStatus: mongoSub.status,
              issue: "Active MongoDB subscription without Stripe subscription ID"
            });
          }
        }
      } catch (err) {
        console.error(`Error auditing user ${user._id}:`, err);
      }
    }

    // Find users with active subscriptions but no Stripe customer ID
    const usersWithActiveSubs = await User.find({
      activeSubscriptionId: { $ne: null },
      $or: [
        { stripeCustomerId: { $exists: false } },
        { stripeCustomerId: null }
      ]
    });

    for (const user of usersWithActiveSubs) {
      issues.usersWithoutStripeCustomer.push({
        userId: user._id,
        userEmail: user.email,
        activeSubscriptionId: user.activeSubscriptionId,
        issue: "User has active subscription but no Stripe customer ID"
      });
    }

    // Summary
    const summary = {
      totalIssues: 
        issues.paidButInactive.length +
        issues.activeWithoutPayment.length +
        issues.stripeMongoMismatches.length +
        issues.orphanedSubscriptions.length +
        issues.usersWithoutStripeCustomer.length,
      paidButInactive: issues.paidButInactive.length,
      activeWithoutPayment: issues.activeWithoutPayment.length,
      stripeMongoMismatches: issues.stripeMongoMismatches.length,
      orphanedSubscriptions: issues.orphanedSubscriptions.length,
      usersWithoutStripeCustomer: issues.usersWithoutStripeCustomer.length
    };

    res.json({
      success: true,
      summary,
      issues
    });
  } catch (err) {
    console.error("Audit error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
