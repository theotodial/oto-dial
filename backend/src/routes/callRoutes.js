import express from "express";
import axios from "axios";
import authenticateUser from "../middleware/authenticateUser.js";
import requireActiveSubscription from "../middleware/requireActiveSubscription.js";
import Call from "../models/Call.js";

const router = express.Router();

router.use(authenticateUser);

router.post("/", requireActiveSubscription, async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.body.to;

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      error: "phoneNumber required"
    });
  }

  const call = await Call.create({
    user: req.userId,
    phoneNumber,
    status: "queued"
  });

  res.json({ success: true, call });
});

router.post("/:id/start", requireActiveSubscription, async (req, res) => {
  try {
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found"
      });
    }

    const numbers = req.subscription?.numbers || [];
    if (!numbers.length) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    const fromNumber = numbers[0].phoneNumber;

    const response = await axios.post(
      "https://api.telnyx.com/v2/calls",
      {
        to: call.phoneNumber,
        from: fromNumber,
        connection_id: process.env.TELNYX_CONNECTION_ID
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`
        }
      }
    );

    call.status = "dialing";
    call.telnyxCallControlId = response.data.data.id;
    await call.save();

    res.json({ success: true });
  } catch (err) {
    console.error("CALL START ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Failed to start call"
    });
  }
});

router.get("/", async (req, res) => {
  const calls = await Call.find({ user: req.userId }).sort("-createdAt");
  res.json({ success: true, calls });
});

export default router;
