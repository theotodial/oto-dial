import express from "express";
import jwt from "jsonwebtoken";
import PhoneNumber from "../models/PhoneNumber.js";

const router = express.Router();

/**
 * GET /api/webrtc/token
 * Generates a JWT token for Telnyx WebRTC client authentication
 */
router.get("/token", async (req, res) => {
  try {
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    // Get user's phone numbers
    let numbers = req.subscription.numbers || [];
    
    // Fallback: query PhoneNumber directly
    if (!numbers.length) {
      const phoneNumbers = await PhoneNumber.find({
        userId: req.userId,
        status: "active"
      }).lean();
      numbers = phoneNumbers.map(n => ({ phoneNumber: n.phoneNumber }));
    }

    if (!numbers.length) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    const callerIdNumber = numbers[0].phoneNumber;
    const sipUsername = process.env.TELNYX_SIP_USERNAME;
    const connectionId = process.env.TELNYX_CONNECTION_ID;

    if (!sipUsername || !connectionId) {
      console.error("Missing TELNYX_SIP_USERNAME or TELNYX_CONNECTION_ID");
      return res.status(503).json({ error: "WebRTC not configured" });
    }

    // Return credentials for the client to use
    res.json({
      success: true,
      credentials: {
        sipUsername,
        connectionId,
        callerIdNumber,
        userId: req.userId.toString()
      }
    });
  } catch (err) {
    console.error("WebRTC token error:", err);
    res.status(500).json({ error: "Failed to generate WebRTC credentials" });
  }
});

export default router;
