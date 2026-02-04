import express from "express";
import SupportTicket from "../models/SupportTicket.js";

const router = express.Router();

/**
 * POST /api/contact
 * Contact form handler (NO nodemailer)
 */
router.post("/", async (req, res) => {
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

    // Create support ticket in MongoDB
    const ticket = await SupportTicket.create({
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
      status: "open"
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
