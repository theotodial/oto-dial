import express from "express";
import Wallet from "../models/Wallet.js";

const router = express.Router();

/**
 * GET /api/wallet
 */
router.get("/", async (req, res) => {
  let wallet = await Wallet.findOne({ userId: req.userId });

  if (!wallet) {
    wallet = await Wallet.create({
      userId: req.userId,
      balance: 0
    });
  }

  res.json({ balance: wallet.balance });
});

/**
 * POST /api/wallet/topup
 * TEMP: Adds balance directly (Stripe already validated elsewhere)
 */
router.post("/topup", async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  let wallet = await Wallet.findOne({ userId: req.userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId: req.userId });
  }

  wallet.balance += amount;
  await wallet.save();

  res.json({ success: true, balance: wallet.balance });
});

export default router;
