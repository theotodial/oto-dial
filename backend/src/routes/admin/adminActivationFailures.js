import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import SubscriptionActivationFailure from "../../models/SubscriptionActivationFailure.js";
import User from "../../models/User.js";
import {
  repairUserSubscriptionFromStripe
} from "../../services/stripeSubscriptionService.js";

const router = express.Router();
router.use(requireAdmin);

function serializeFailure(doc) {
  return {
    id: doc._id,
    sourceEventId: doc.sourceEventId,
    sourceEventType: doc.sourceEventType,
    invoiceId: doc.invoiceId,
    checkoutSessionId: doc.checkoutSessionId,
    stripeSubscriptionId: doc.stripeSubscriptionId,
    stripeCustomerId: doc.stripeCustomerId,
    userId: doc.userId?._id || doc.userId || null,
    userEmail: doc.userId?.email || null,
    planId: doc.planId || null,
    reason: doc.reason,
    status: doc.status,
    resolvedAt: doc.resolvedAt,
    resolvedBy: doc.resolvedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

router.get("/activation-failures", async (req, res) => {
  try {
    const status = (req.query.status || "open").toString();
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;

    const query = {};
    if (status !== "all") {
      query.status = status;
    }

    const [rows, total, summaryRows] = await Promise.all([
      SubscriptionActivationFailure.find(query)
        .populate("userId", "email stripeCustomerId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SubscriptionActivationFailure.countDocuments(query),
      SubscriptionActivationFailure.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const summary = {
      open: 0,
      resolved: 0,
      total: 0
    };
    summaryRows.forEach((row) => {
      if (row._id === "open" || row._id === "resolved") {
        summary[row._id] = row.count;
      }
      summary.total += row.count;
    });

    res.json({
      success: true,
      summary,
      failures: rows.map(serializeFailure),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error("Activation failures list error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch activation failures"
    });
  }
});

router.post("/activation-failures/:id/resolve", async (req, res) => {
  try {
    const failure = await SubscriptionActivationFailure.findById(req.params.id);
    if (!failure) {
      return res.status(404).json({
        success: false,
        error: "Failure record not found"
      });
    }

    failure.status = "resolved";
    failure.resolvedAt = new Date();
    failure.resolvedBy = req.user?.email || req.userId || "admin";
    await failure.save();

    return res.json({
      success: true,
      message: "Failure marked as resolved",
      failure: serializeFailure(failure)
    });
  } catch (err) {
    console.error("Resolve activation failure error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to resolve activation failure"
    });
  }
});

router.post("/activation-failures/:id/repair", async (req, res) => {
  try {
    const failure = await SubscriptionActivationFailure.findById(req.params.id);
    if (!failure) {
      return res.status(404).json({
        success: false,
        error: "Failure record not found"
      });
    }

    let userId = failure.userId || null;
    let stripeCustomerId = failure.stripeCustomerId || null;

    if (!userId && stripeCustomerId) {
      const user = await User.findOne({ stripeCustomerId }).select("_id");
      userId = user?._id || null;
    }

    if (!userId && !stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: "No user linkage found for this failure"
      });
    }

    const repairResult = await repairUserSubscriptionFromStripe({
      userId,
      stripeCustomerId,
      reason: `activation_failure_${failure._id}`
    });

    if (repairResult.success) {
      failure.status = "resolved";
      failure.resolvedAt = new Date();
      failure.resolvedBy = req.user?.email || req.userId || "admin";
      await failure.save();
    }

    return res.json({
      success: repairResult.success,
      message: repairResult.success
        ? "Subscription repair completed and failure resolved"
        : "Repair attempted but not completed",
      repairResult,
      failure: serializeFailure(failure)
    });
  } catch (err) {
    console.error("Repair activation failure error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to repair activation failure"
    });
  }
});

export default router;
