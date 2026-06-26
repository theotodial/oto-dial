import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import {
  reconcileUser,
  reconcileUserWallet,
  reconcileUserCalls,
  reconcileUserSms,
  runSystemReconciliation,
  getLedgerExplorer,
} from "../../services/creditReconciliationService.js";

const router = express.Router();

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
}

function parseSince(query) {
  const days = Number(query.days);
  if (Number.isFinite(days) && days > 0) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  if (query.since) {
    const d = new Date(query.since);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

/**
 * GET /api/admin/analytics/billing/reconciliation
 * System-wide billing reconciliation scan.
 */
router.get("/reconciliation", requireAdmin, async (req, res) => {
  try {
    const since = parseSince(req.query);
    const userBatch = Number(req.query.userBatch) || 100;
    const deepScan = req.query.shallow !== "1";

    const report = await runSystemReconciliation({
      since,
      userBatch,
      deepScan,
      perUserLimit: Number(req.query.perUserLimit) || 100,
    });

    res.json({ success: true, ...report });
  } catch (err) {
    console.error("[adminCreditReconciliation] system", err);
    res.status(500).json({ success: false, error: err.message || "reconciliation_failed" });
  }
});

/**
 * GET /api/admin/analytics/billing/reconciliation/:userId
 * Full per-user reconciliation (wallet + calls + SMS).
 */
router.get("/reconciliation/:userId", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) {
      return res.status(400).json({ success: false, error: "invalid_user_id" });
    }

    const since = parseSince(req.query);
    const report = await reconcileUser(uid, {
      since,
      limit: Number(req.query.limit) || 200,
    });

    res.json({ success: true, ...report });
  } catch (err) {
    console.error("[adminCreditReconciliation] user", err);
    res.status(500).json({ success: false, error: err.message || "reconciliation_failed" });
  }
});

/**
 * GET /api/admin/analytics/billing/reconciliation/:userId/wallet
 */
router.get("/reconciliation/:userId/wallet", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) return res.status(400).json({ success: false, error: "invalid_user_id" });
    const report = await reconcileUserWallet(uid);
    res.json({ success: true, ...report });
  } catch (err) {
    console.error("[adminCreditReconciliation] wallet", err);
    res.status(500).json({ success: false, error: err.message || "reconciliation_failed" });
  }
});

/**
 * GET /api/admin/analytics/billing/reconciliation/:userId/calls
 */
router.get("/reconciliation/:userId/calls", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) return res.status(400).json({ success: false, error: "invalid_user_id" });
    const report = await reconcileUserCalls(uid, {
      since: parseSince(req.query),
      limit: Number(req.query.limit) || 200,
    });
    res.json({ success: true, ...report });
  } catch (err) {
    console.error("[adminCreditReconciliation] calls", err);
    res.status(500).json({ success: false, error: err.message || "reconciliation_failed" });
  }
});

/**
 * GET /api/admin/analytics/billing/reconciliation/:userId/sms
 */
router.get("/reconciliation/:userId/sms", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) return res.status(400).json({ success: false, error: "invalid_user_id" });
    const report = await reconcileUserSms(uid, {
      since: parseSince(req.query),
      limit: Number(req.query.limit) || 200,
    });
    res.json({ success: true, ...report });
  } catch (err) {
    console.error("[adminCreditReconciliation] sms", err);
    res.status(500).json({ success: false, error: err.message || "reconciliation_failed" });
  }
});

/**
 * GET /api/admin/analytics/billing/ledger/:userId
 * Credit Ledger Explorer — every deduction with full context.
 */
router.get("/ledger/:userId", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) return res.status(400).json({ success: false, error: "invalid_user_id" });

    const result = await getLedgerExplorer(uid, {
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
      type: req.query.type || null,
      callId: req.query.callId || null,
      smsId: req.query.smsId || null,
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("[adminCreditReconciliation] ledger", err);
    res.status(500).json({ success: false, error: err.message || "ledger_explorer_failed" });
  }
});

/**
 * POST /api/admin/analytics/billing/repair/wallet-sync
 * Sync User cache + reserved credits from Subscription / EconomicTimeline (safe repair).
 */
router.post("/repair/wallet-sync", requireAdmin, async (req, res) => {
  try {
    const userId = req.body?.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: "user_id_required" });
    }
    const { syncUserCacheFromSubscription } = await import(
      "../../services/billingEnforcementGateway.js"
    );
    const { syncSubscriptionReservedFromTimelines } = await import(
      "../../services/reservationReconciliationService.js"
    );
    await syncUserCacheFromSubscription(userId);
    const reserved = await syncSubscriptionReservedFromTimelines(userId);
    res.json({ success: true, userId: String(userId), reserved });
  } catch (err) {
    console.error("[adminCreditReconciliation] repair", err);
    res.status(500).json({ success: false, error: err.message || "repair_failed" });
  }
});

export default router;
