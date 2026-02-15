import express from "express";
import SupportTicket from "../models/SupportTicket.js";
import authenticateUser from "../middleware/authenticateUser.js";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const router = express.Router();

const ISSUE_SUBJECTS = {
  subscription_not_activated: "Subscription not activated",
  billing_issue: "Billing issue",
  number_issue: "Number issue",
  general: "General support"
};

function normalizeIssueType(rawIssueType, rawSubject) {
  const issueType = (rawIssueType || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ISSUE_SUBJECTS, issueType)) {
    return issueType;
  }

  const subject = (rawSubject || "").trim().toLowerCase();
  if (subject.includes("subscription") && subject.includes("not")) {
    return "subscription_not_activated";
  }
  if (subject.includes("bill") || subject.includes("payment") || subject.includes("invoice")) {
    return "billing_issue";
  }
  if (subject.includes("number")) {
    return "number_issue";
  }
  return "general";
}

/**
 * POST /api/support/upload-screenshot
 * Upload support screenshot (image only) and return URL.
 */
router.post("/upload-screenshot", authenticateUser, async (req, res) => {
  try {
    const { imageData } = req.body || {};

    if (!imageData || typeof imageData !== "string") {
      return res.status(400).json({
        success: false,
        error: "imageData is required"
      });
    }

    const match = imageData.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
    if (!match) {
      return res.status(400).json({
        success: false,
        error: "Only PNG, JPG, JPEG, and WEBP images are allowed"
      });
    }

    const [, ext, base64Payload] = match;
    const buffer = Buffer.from(base64Payload, "base64");

    const maxBytes = 5 * 1024 * 1024; // 5MB
    if (buffer.length > maxBytes) {
      return res.status(400).json({
        success: false,
        error: "Screenshot exceeds 5MB limit"
      });
    }

    const uploadDir = path.join(process.cwd(), "uploads", "support");
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase()}`;
    const fullPath = path.join(uploadDir, filename);
    await fs.writeFile(fullPath, buffer);

    const relativeUrl = `/uploads/support/${filename}`;
    const screenshotUrl = process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL}${relativeUrl}`
      : relativeUrl;

    return res.json({
      success: true,
      screenshotUrl
    });
  } catch (err) {
    console.error("Upload screenshot error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to upload screenshot"
    });
  }
});

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
router.post("/tickets", authenticateUser, async (req, res) => {
  try {
    const userId = req.userId;
    const userEmail = req.user?.email || req.userEmail || (req.user && typeof req.user === 'object' ? req.user.email : null);
    const userName = req.user?.name || req.user?.email || req.userEmail || 'User';
    const {
      subject,
      issueType,
      description,
      message,
      priority = "medium",
      category,
      screenshotUrl,
      stripePaymentId
    } = req.body || {};

    const normalizedIssueType = normalizeIssueType(issueType, subject);
    const effectiveSubject = ISSUE_SUBJECTS[normalizedIssueType] || (subject || "").trim();
    const effectiveMessage = (description || message || "").trim();

    console.log("📝 Creating support ticket:", {
      userId,
      userEmail,
      userName,
      issueType: normalizedIssueType,
      subject: effectiveSubject?.substring(0, 50)
    });

    if (!effectiveSubject) {
      return res.status(400).json({
        success: false,
        error: "Subject is required"
      });
    }

    if (!effectiveMessage) {
      return res.status(400).json({
        success: false,
        error: "Message is required"
      });
    }

    // Validate priority
    const validPriorities = ["low", "medium", "high", "urgent"];
    const defaultPriority = normalizedIssueType === "subscription_not_activated" ? "high" : "medium";
    const ticketPriority = validPriorities.includes(priority) ? priority : defaultPriority;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: "User email not found. Please ensure you are logged in."
      });
    }

    const ticket = await SupportTicket.create({
      user: userId,
      email: userEmail,
      name: userName,
      subject: effectiveSubject,
      issueType: normalizedIssueType,
      message: effectiveMessage,
      screenshotUrl: screenshotUrl || null,
      stripePaymentId: stripePaymentId?.trim() || null,
      status: "open",
      priority: ticketPriority,
      businessCategory: category || "",
      replies: []
    });

    console.log(`✅ New support ticket created: ${ticket._id} by user ${userId}`);

    res.json({
      success: true,
      message: "Support ticket created successfully",
      ticket: {
        id: ticket._id,
        issueType: ticket.issueType,
        subject: ticket.subject,
        message: ticket.message,
        screenshotUrl: ticket.screenshotUrl,
        stripePaymentId: ticket.stripePaymentId,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt
      }
    });
  } catch (err) {
    console.error("Create ticket error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to create ticket"
    });
  }
});

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
        issueType: ticket.issueType,
        subject: ticket.subject,
        message: ticket.message,
        screenshotUrl: ticket.screenshotUrl,
        stripePaymentId: ticket.stripePaymentId,
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
        issueType: ticket.issueType,
        subject: ticket.subject,
        message: ticket.message,
        screenshotUrl: ticket.screenshotUrl,
        stripePaymentId: ticket.stripePaymentId,
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
