import express from "express";
import Wallet from "../models/Wallet.js";

const router = express.Router();

/**
 * GET /api/wallet
 * Returns the user's current wallet balance
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.userId;
    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    console.error("Wallet fetch error:", err);
    res.status(500).json({ error: "Failed to load wallet" });
  }
});

/**
 * GET /api/wallet/transactions
 * Placeholder until transactions are persisted
 */
router.get("/transactions", async (_req, res) => {
  res.json({ success: true, transactions: [] });
});

/**
 * POST /api/wallet/topup
 * body: { amount }
 */
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
    console.error("Wallet topup error:", err);
    res.status(500).json({ error: "Failed to top up wallet" });
  }
});

export default router;
