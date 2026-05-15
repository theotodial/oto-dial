import express from "express";
import Call from "../models/Call.js";
import CreditLedger from "../models/CreditLedger.js";
import { getUserCreditSnapshot } from "../services/creditLedgerService.js";
import { computeProjectedUserBalance } from "../services/projectedBalanceService.js";
import Wallet from "../models/Wallet.js";

const router = express.Router();

const ACTIVE_CALL_STATUSES = [
  "queued",
  "initiated",
  "dialing",
  "ringing",
  "early-media",
  "answered",
  "in-progress",
];

/**
 * GET /api/wallet
 * Telecom credit wallet (authoritative: User.remainingCredits + ledger).
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.userId;
    const snap = await getUserCreditSnapshot(userId);
    if (!snap) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const remainingCredits = Math.max(0, Number(snap.remainingCredits || 0));
    const reservedCredits = Math.max(0, Number(snap.reservedCredits || 0));
    const availableCredits = remainingCredits - reservedCredits;

    const [lastLedger, activeCalls, projection] = await Promise.all([
      CreditLedger.findOne({ user: userId })
        .sort({ createdAt: -1 })
        .select("createdAt type amount callId")
        .lean(),
      Call.find({
        user: userId,
        direction: "outbound",
        status: { $in: ACTIVE_CALL_STATUSES },
        $or: [{ creditReservationHeld: { $gt: 0 } }, { attemptChargedAt: { $ne: null } }],
      })
        .select("_id status creditReservationHeld attemptChargedAt toNumber phoneNumber createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      computeProjectedUserBalance(userId).catch(() => null),
    ]);

    const activeCallReservations = activeCalls.map((c) => ({
      callId: String(c._id),
      status: c.status,
      heldCredits: Number(c.creditReservationHeld || 0),
      attemptCharged: Boolean(c.attemptChargedAt),
      destination: c.toNumber || c.phoneNumber || null,
      createdAt: c.createdAt,
    }));

    // Legacy Stripe cash wallet (optional separate balance)
    let legacyWallet = await Wallet.findOne({ userId }).lean();
    if (!legacyWallet) {
      legacyWallet = { balance: 0 };
    }

    console.log("[CALL CREDIT] wallet_snapshot", {
      userId: String(userId),
      remainingCredits,
      reservedCredits,
      availableCredits,
      activeReservations: activeCallReservations.length,
    });

    res.json({
      success: true,
      balance: remainingCredits,
      remainingCredits,
      reservedCredits,
      availableCredits,
      projectedAvailableCredits: projection?.projectedAvailableCredits ?? availableCredits,
      lastChargeAt: lastLedger?.createdAt || null,
      lastChargeType: lastLedger?.type || null,
      activeCallReservations,
      legacyCashBalance: Number(legacyWallet.balance || 0),
    });
  } catch (err) {
    console.error("[CALL ERROR] GET /api/wallet", err?.stack || err);
    res.status(500).json({ success: false, error: "Failed to load wallet" });
  }
});

router.get("/transactions", async (_req, res) => {
  res.json({ success: true, transactions: [] });
});

router.post("/topup", async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { userId: req.userId },
      { $inc: { balance: amount } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    console.error("[CALL ERROR] POST /api/wallet/topup", err?.stack || err);
    res.status(500).json({ error: "Failed to top up wallet" });
  }
});

export default router;
