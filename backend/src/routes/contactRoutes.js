import express from "express";
import SupportTicket from "../models/SupportTicket.js";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/contact
 * Contact form handler (NO nodemailer)
 * Links ticket to user if logged in (authentication optional)
 */
router.post("/", async (req, res) => {
  // Try to get user if authenticated, but don't require it
  let userId = null;
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.userId) {
        const user = await User.findById(decoded.userId);
        if (user) {
          userId = user._id;
        }
      }
    }
  } catch (e) {
    // Ignore auth errors - form can be submitted without login
  }
  try {
    const {
      name,
      email,
      phone,
      businessCategory,
      businessDescription,
      serviceRequest,
      isUrgent
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: "Name and email are required"
      });
    }

    // If user is logged in, link ticket to user account
    const userId = req.userId || null;

    // Create support ticket in MongoDB
    const ticket = await SupportTicket.create({
      user: userId,
      name,
      email,
      phone: phone || "",
      subject: serviceRequest || "General Inquiry",
      message: businessDescription || serviceRequest || "No message provided",
      businessCategory,
      businessDescription,
      serviceRequest,
      isUrgent: isUrgent || false,
      priority: isUrgent ? "urgent" : "medium",
      status: "open",
      replies: [] // Initialize empty replies array
    });

    console.log("📩 CONTACT FORM SUBMISSION - Ticket Created:", {
      ticketId: ticket._id,
      name,
      email,
      receivedAt: new Date().toISOString()
    });

    // Always return success (frontend-friendly)
    return res.json({
      success: true,
      message: "Thank you! Our team will contact you shortly.",
      ticketId: ticket._id
    });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to submit contact form"
    });
  }
});

export default router;
