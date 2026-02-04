import express from "express";
import SupportTicket from "../models/SupportTicket.js";
import authenticateUser from "../middleware/authenticateUser.js";

const router = express.Router();

/**
 * GET /api/support/tickets
 * Get user's support tickets (requires authentication)
 */
router.get("/tickets", authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const userEmail = req.user?.email;

    // Get tickets for this user (by userId or email)
    const tickets = await SupportTicket.find({
      $or: [
        { user: userId },
        { email: userEmail }
      ]
    })
      .sort({ createdAt: -1 })
      .select("-adminNotes"); // Don't send admin notes to users

    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        name: ticket.name,
        email: ticket.email,
        phone: ticket.phone,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        priority: ticket.priority,
        businessCategory: ticket.businessCategory,
        businessDescription: ticket.businessDescription,
        serviceRequest: ticket.serviceRequest,
        isUrgent: ticket.isUrgent,
        replies: ticket.replies || [],
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      }))
    });
  } catch (err) {
    console.error("Get user tickets error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch tickets"
    });
  }
});

/**
 * GET /api/support/tickets/:id
 * Get single ticket details (user's own ticket only)
 */
router.get("/tickets/:id", authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const userEmail = req.user?.email;
    const ticketId = req.params.id;

    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: "Ticket not found"
      });
    }

    // Verify user owns this ticket
    if (ticket.user?.toString() !== userId?.toString() && ticket.email !== userEmail) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        name: ticket.name,
        email: ticket.email,
        phone: ticket.phone,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        priority: ticket.priority,
        businessCategory: ticket.businessCategory,
        businessDescription: ticket.businessDescription,
        serviceRequest: ticket.serviceRequest,
        isUrgent: ticket.isUrgent,
        replies: ticket.replies || [],
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      }
    });
  } catch (err) {
    console.error("Get ticket detail error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch ticket"
    });
  }
});

/**
 * POST /api/support/tickets/:id/reply
 * User replies to their ticket
 */
router.post("/tickets/:id/reply", authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const userEmail = req.user?.email;
    const userName = req.user?.name || req.user?.email;
    const ticketId = req.params.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: "Ticket not found"
      });
    }

    // Verify user owns this ticket
    if (ticket.user?.toString() !== userId?.toString() && ticket.email !== userEmail) {
      return res.status(403).json({
        success: false,
        error: "Access denied"
      });
    }

    // Add reply
    const reply = {
      message: message.trim(),
      from: "user",
      fromName: userName,
      fromEmail: userEmail,
      createdAt: new Date()
    };

    ticket.replies = ticket.replies || [];
    ticket.replies.push(reply);

    // Update ticket status if it was closed/resolved
    if (ticket.status === "closed" || ticket.status === "resolved") {
      ticket.status = "open";
    }

    await ticket.save();

    res.json({
      success: true,
      message: "Reply sent successfully",
      ticket: {
        id: ticket._id,
        status: ticket.status,
        replies: ticket.replies
      }
    });
  } catch (err) {
    console.error("Reply to ticket error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to send reply"
    });
  }
});

export default router;
