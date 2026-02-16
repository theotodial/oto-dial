import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import SubscriptionActivationFailure from "../../models/SubscriptionActivationFailure.js";
import User from "../../models/User.js";
import {
  repairUserSubscriptionFromStripe,
  reconcilePaidSubscriptionInvoices
} from "../../services/stripeSubscriptionService.js";

const router = express.Router();
router.use(requireAdmin);
let cachedReconciliation = null;
let cachedReconciliationAt = 0;

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

function parsePositiveInt(value, fallback, maxValue = null) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  if (Number.isFinite(maxValue) && parsed > maxValue) {
    return maxValue;
  }
  return parsed;
}

router.get("/activation-failures", async (req, res) => {
  try {
    const status = (req.query.status || "open").toString();
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;
    const shouldReconcile = String(req.query.reconcile || "true")
      .trim()
      .toLowerCase() !== "false";
    const autoRepair = String(req.query.autoRepair || "true")
      .trim()
      .toLowerCase() !== "false";
    const syncFromStripe = String(req.query.syncFromStripe || "false")
      .trim()
      .toLowerCase() === "true";
    const hoursBack = parsePositiveInt(req.query.hoursBack, 24 * 14, 24 * 120);
    const maxInvoices = parsePositiveInt(req.query.maxInvoices, 300, 1500);

    const query = {};
    if (status !== "all") {
      query.status = status;
    }

    let reconciliation = null;
    if (shouldReconcile) {
      const shouldUseCache =
        !syncFromStripe &&
        cachedReconciliation &&
        (Date.now() - cachedReconciliationAt) < (2 * 60 * 1000);

      if (shouldUseCache) {
        reconciliation = cachedReconciliation;
      } else {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (hoursBack * 60 * 60 * 1000));
        reconciliation = await reconcilePaidSubscriptionInvoices({
          startDate,
          endDate,
          maxInvoices,
          autoRepair,
          performStripeSync: syncFromStripe,
          reason: "admin_activation_failures_feed"
        });

        cachedReconciliation = reconciliation;
        cachedReconciliationAt = Date.now();
      }
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
      reconciliation,
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

router.post("/activation-failures/reconcile", async (req, res) => {
  try {
    const body = req.body || {};
    const hoursBack = parsePositiveInt(body.hoursBack, 24 * 14, 24 * 120);
    const maxInvoices = parsePositiveInt(body.maxInvoices, 500, 2000);
    const stripeSyncMaxPages = parsePositiveInt(body.stripeSyncMaxPages, 10, 30);
    const autoRepair = body.autoRepair !== false;
    const syncFromStripe = body.syncFromStripe !== false;

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (hoursBack * 60 * 60 * 1000));
    const reconciliation = await reconcilePaidSubscriptionInvoices({
      startDate,
      endDate,
      maxInvoices,
      autoRepair,
      performStripeSync: syncFromStripe,
      stripeSyncMaxPages,
      reason: "admin_manual_reconcile"
    });

    cachedReconciliation = reconciliation;
    cachedReconciliationAt = Date.now();

    return res.json({
      success: true,
      message: "Subscription reconciliation completed",
      reconciliation
    });
  } catch (err) {
    console.error("Manual activation reconciliation error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to run activation reconciliation"
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
