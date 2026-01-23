import express from "express";
import PushSubscription from "../models/PushSubscription.js";
import { isPushEnabled } from "../services/pushService.js";

const router = express.Router();

router.get("/public-key", (req, res) => {
  if (!process.env.WEB_PUSH_PUBLIC_KEY) {
    return res.status(503).json({ error: "Push not configured" });
  }
  return res.json({ publicKey: process.env.WEB_PUSH_PUBLIC_KEY });
});

router.post("/subscribe", async (req, res) => {
  try {
    if (!isPushEnabled()) {
      return res.status(503).json({ error: "Push not configured" });
    }

    const subscription = req.body?.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }

    const userAgent = req.headers["user-agent"] || "";

    const saved = await PushSubscription.findOneAndUpdate(
      { user: req.userId, endpoint: subscription.endpoint },
      {
        user: req.userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, subscriptionId: saved._id });
  } catch (err) {
    console.error("PUSH SUBSCRIBE ERROR:", err);
    return res.status(500).json({ error: "Failed to save subscription" });
  }
});

router.post("/unsubscribe", async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    if (!endpoint) {
      return res.status(400).json({ error: "Endpoint required" });
    }

    await PushSubscription.deleteOne({ user: req.userId, endpoint });
    return res.json({ success: true });
  } catch (err) {
    console.error("PUSH UNSUBSCRIBE ERROR:", err);
    return res.status(500).json({ error: "Failed to unsubscribe" });
  }
});

export default router;
