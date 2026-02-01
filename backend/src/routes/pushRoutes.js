import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import PushSubscription from "../models/PushSubscription.js";
import { getVapidPublicKey } from "../services/pushService.js";

const router = express.Router();

/**
 * GET /api/push/vapid-public
 * Returns VAPID public key for client to subscribe (public)
 */
router.get("/vapid-public", async (req, res) => {
  try {
    const key = await getVapidPublicKey();
    if (!key) {
      return res.status(503).json({ success: false, error: "Push not configured" });
    }
    res.json({ success: true, publicKey: key });
  } catch (err) {
    console.error("GET /api/push/vapid-public error:", err);
    res.status(503).json({ success: false, error: "Push not configured" });
  }
});

/**
 * POST /api/push/subscribe
 * Save push subscription for current user (requires auth)
 */
router.post("/subscribe", authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const { endpoint, keys } = req.body;
    const p256dh = keys?.p256dh || keys?.p256Dh;
    if (!endpoint || !keys?.auth || !p256dh) {
      return res.status(400).json({ success: false, error: "endpoint and keys (auth, p256dh) required" });
    }
    await PushSubscription.findOneAndUpdate(
      { user: userId, endpoint },
      {
        user: userId,
        endpoint,
        keys: { auth: keys.auth, p256dh: p256dh },
        userAgent: req.headers["user-agent"] || ""
      },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/push/subscribe error:", err);
    res.status(500).json({ success: false, error: "Failed to save subscription" });
  }
});

export default router;
