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

/**
 * GET /api/webrtc/status
 * Check WebRTC connection status and provide debugging info
 */
router.get("/status", async (req, res) => {
  try {
    const connectionId = process.env.TELNYX_CONNECTION_ID;
    const sipUsername = process.env.TELNYX_SIP_USERNAME;
    
    // Get user's phone numbers
    let numbers = req.subscription?.numbers || [];
    if (!numbers.length) {
      const phoneNumbers = await PhoneNumber.find({
        userId: req.userId,
        status: "active"
      }).lean();
      numbers = phoneNumbers.map(n => ({ phoneNumber: n.phoneNumber }));
    }
    
    res.json({
      success: true,
      status: {
        connectionId: connectionId || "NOT SET",
        sipUsername: sipUsername ? "SET" : "NOT SET",
        phoneNumbers: numbers.map(n => n.phoneNumber || n),
        webhookUrl: process.env.BACKEND_URL 
          ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/voice`
          : "NOT SET",
        instructions: {
          step1: "Ensure TELNYX_CONNECTION_ID is set in backend .env",
          step2: "Ensure TELNYX_SIP_USERNAME is set in backend .env",
          step3: "Ensure VITE_TELNYX_SIP_PASSWORD is set in frontend .env",
          step4: `Set webhook URL in Telnyx Connection: ${process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/voice` : 'YOUR_BACKEND_URL/api/webhooks/telnyx/voice'}`,
          step5: `Ensure each phone number has connection_id set to: ${connectionId || 'YOUR_CONNECTION_ID'}`,
          step6: "Frontend WebRTC client must be connected and ready to receive calls"
        }
      }
    });
  } catch (err) {
    console.error("WebRTC status error:", err);
    res.status(500).json({ error: "Failed to get WebRTC status" });
  }
});

export default router;
