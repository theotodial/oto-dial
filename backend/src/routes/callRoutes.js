import express from "express";
import axios from "axios";
import authenticateUser from "../middleware/authenticateUser.js";
import requireActiveSubscription from "../middleware/requireActiveSubscription.js";
import Call from "../models/Call.js";
import { validateCallCountryLock } from "../middleware/countryLock.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  isUnlimitedSubscription
} from "../services/unlimitedUsageService.js";

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

  const unlimitedGate = await checkUnlimitedUsageBeforeAction({
    subscriptionId: req.subscription.id,
    userId: req.userId,
    channel: "calls_create_record"
  });

  if (!unlimitedGate.allowed) {
    return res.status(403).json(createSuspiciousActivityErrorPayload());
  }

  const unlimitedPlan = isUnlimitedSubscription(
    unlimitedGate.subscription || req.subscription
  );

  if (!unlimitedPlan) {
    const minutesRemaining = req.subscription.minutesRemaining || 0;
    if (minutesRemaining <= 0) {
      return res.status(403).json({
        success: false,
        error: "No minutes remaining. Please upgrade your plan or wait for your next billing cycle."
      });
    }
  }

  const call = await Call.create({
    user: req.userId,
    phoneNumber,
    status: "queued"
  });

  res.json({ success: true, call });
});

router.post("/:id/start", requireActiveSubscription, validateCallCountryLock, async (req, res) => {
  try {
    const unlimitedGate = await checkUnlimitedUsageBeforeAction({
      subscriptionId: req.subscription.id,
      userId: req.userId,
      channel: "calls_start"
    });

    if (!unlimitedGate.allowed) {
      return res.status(403).json(createSuspiciousActivityErrorPayload());
    }

    const unlimitedPlan = isUnlimitedSubscription(
      unlimitedGate.subscription || req.subscription
    );

    if (!unlimitedPlan) {
      const minutesRemaining = req.subscription.minutesRemaining || 0;
      if (minutesRemaining <= 0) {
        return res.status(403).json({
          success: false,
          error: "No minutes remaining. Please upgrade your plan or wait for your next billing cycle."
        });
      }
    }

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
  try {
    // Build query with optional filters
    const query = { user: req.userId };
    
    // Support filtering by status
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    // Support filtering by direction
    if (req.query.direction) {
      query.direction = req.query.direction;
    }
    
    // Support limit
    const limit = parseInt(req.query.limit) || 100;
    
    const calls = await Call.find(query)
      .sort("-createdAt")
      .limit(limit)
      .lean();
    
    // Format calls with duration and proper classification
    const formattedCalls = calls.map(call => {
      const durationSeconds = call.durationSeconds || 0;
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      const durationFormatted = durationSeconds > 0 
        ? `${minutes}:${String(seconds).padStart(2, '0')}`
        : null;
      
      // Classify call type
      let callType = 'outgoing';
      if (call.direction === 'inbound') {
        if (call.status === 'missed') {
          callType = 'missed';
        } else if (call.status === 'completed' || call.status === 'answered') {
          callType = 'incoming';
        } else {
          callType = 'incoming';
        }
      } else {
        if (call.status === 'completed' || call.status === 'answered') {
          callType = 'outgoing';
        } else if (call.status === 'failed') {
          callType = 'failed';
        } else {
          callType = 'outgoing';
        }
      }
      
      return {
        ...call,
        id: call._id,
        _id: call._id,
        phoneNumber: call.phoneNumber || call.toNumber || call.fromNumber,
        toNumber: call.toNumber || call.phoneNumber,
        fromNumber: call.fromNumber || call.phoneNumber,
        durationFormatted,
        callType,
        // Ensure status is properly set
        status: call.status || 'completed'
      };
    });
    
    res.json({ success: true, calls: formattedCalls });
  } catch (err) {
    console.error('GET /api/calls error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch calls' });
  }
});

// Get a single call record
router.get("/:id", async (req, res) => {
  try {
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId
    }).lean();

    if (!call) {
      return res.status(404).json({ success: false, error: "Call not found" });
    }

    return res.json({ success: true, call });
  } catch (err) {
    console.error("GET /api/calls/:id error:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch call" });
  }
});

// Update a call record
router.patch("/:id", async (req, res) => {
  try {
    const { status, durationSeconds, callEndedAt, callStartedAt } = req.body;
    
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

    // Update allowed fields
    if (status) call.status = status;
    if (durationSeconds !== undefined) call.durationSeconds = durationSeconds;
    if (callEndedAt) call.callEndedAt = new Date(callEndedAt);
    if (callStartedAt) call.callStartedAt = new Date(callStartedAt);

    await call.save();

    res.json({ success: true, call });
  } catch (err) {
    console.error("CALL UPDATE ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update call"
    });
  }
});

/**
 * DELETE /api/calls
 * Delete all call history for the current user
 */
router.delete("/", async (req, res) => {
  try {
    const result = await Call.deleteMany({ user: req.userId });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/calls error:", err);
    res.status(500).json({ success: false, error: "Failed to delete call history" });
  }
});

/**
 * POST /api/calls/:id/answer
 * Answer an incoming call using Telnyx Call Control API (for Voice API)
 */
router.post("/:id/answer", requireActiveSubscription, async (req, res) => {
  try {
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId,
      direction: "inbound",
      status: "ringing"
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found or not answerable"
      });
    }

    if (!call.telnyxCallControlId) {
      return res.status(400).json({
        success: false,
        error: "Call control ID not found"
      });
    }

    // Answer the call using Telnyx Call Control API
    const response = await axios.post(
      `https://api.telnyx.com/v2/calls/${call.telnyxCallControlId}/actions/answer`,
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Update call status
    call.status = "answered";
    call.callStartedAt = new Date();
    await call.save();

    console.log(`✅ Answered incoming call ${call._id} via Call Control API`);

    res.json({ 
      success: true, 
      call,
      telnyxResponse: response.data 
    });
  } catch (err) {
    console.error("ANSWER CALL ERROR:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.errors?.[0]?.detail || "Failed to answer call"
    });
  }
});

/**
 * DELETE /api/calls/:id
 * Delete a single call record
 */
router.delete("/:id", async (req, res) => {
  try {
    const call = await Call.findOneAndDelete({
      _id: req.params.id,
      user: req.userId
    });
    if (!call) {
      return res.status(404).json({ success: false, error: "Call not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/calls/:id error:", err);
    res.status(500).json({ success: false, error: "Failed to delete call" });
  }
});

export default router;
