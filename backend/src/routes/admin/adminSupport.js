import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import SupportTicket from "../../models/SupportTicket.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import { repairUserSubscriptionFromStripe } from "../../services/stripeSubscriptionService.js";
import { sendEmailSafe } from "../../services/email.service.js";
import { frontBase, supportMessageEmail } from "../../emails/templates.js";

const router = express.Router();

function normalizeAdminNotesForWrite(adminNotes) {
  if (adminNotes === undefined) {
    return undefined;
  }
  if (Array.isArray(adminNotes)) {
    return adminNotes
      .map((note) => {
        if (!note) return "";
        if (typeof note === "string") return note.trim();
        if (typeof note === "object" && typeof note.note === "string") return note.note.trim();
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(adminNotes || "").trim();
}

function serializeTicket(ticket, subscriptionContext = null) {
  return {
    id: ticket._id,
    userId: ticket.user?._id,
    userEmail: ticket.user?.email || ticket.email,
    userName: ticket.user?.name || ticket.name,
    name: ticket.name,
    email: ticket.email,
    phone: ticket.phone,
    issueType: ticket.issueType,
    subject: ticket.subject,
    message: ticket.message,
    screenshotUrl: ticket.screenshotUrl || null,
    stripePaymentId: ticket.stripePaymentId || null,
    status: ticket.status,
    priority: ticket.priority,
    adminNotes: ticket.adminNotes,
    resolvedBy: ticket.resolvedBy?._id,
    resolvedByName: ticket.resolvedBy?.name,
    resolvedAt: ticket.resolvedAt,
    businessCategory: ticket.businessCategory,
    businessDescription: ticket.businessDescription,
    serviceRequest: ticket.serviceRequest,
    isUrgent: ticket.isUrgent,
    replies: ticket.replies || [],
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    subscriptionStatus: subscriptionContext?.status || "none",
    stripeCustomerId: ticket.user?.stripeCustomerId || null,
    stripeSubscriptionId: subscriptionContext?.stripeSubscriptionId || null,
    activeSubscriptionId: ticket.user?.activeSubscriptionId || subscriptionContext?._id || null
  };
}

async function buildSubscriptionContextMap(tickets) {
  const userIds = tickets
    .map((ticket) => ticket.user?._id)
    .filter(Boolean);

  if (!userIds.length) {
    return new Map();
  }

  const subscriptions = await Subscription.find({
    userId: { $in: userIds },
    status: { $in: ["active", "pending_activation", "past_due", "incomplete", "cancelled"] }
  }).sort({ updatedAt: -1 });

  const contextByUserId = new Map();
  subscriptions.forEach((subscription) => {
    const key = subscription.userId.toString();
    if (!contextByUserId.has(key)) {
      contextByUserId.set(key, subscription);
    }
  });

  return contextByUserId;
}

/**
 * GET /api/admin/support
 * Get all support tickets
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search, 
      status, 
      priority,
      startDate,
      endDate
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } }
      ];
    }

    const tickets = await SupportTicket.find(query)
      .populate("user", "email name stripeCustomerId activeSubscriptionId subscriptionActive")
      .populate("resolvedBy", "email name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SupportTicket.countDocuments(query);
    const subscriptionContextByUserId = await buildSubscriptionContextMap(tickets);

    res.json({
      success: true,
      tickets: tickets.map((ticket) =>
        serializeTicket(
          ticket,
          ticket.user?._id
            ? subscriptionContextByUserId.get(ticket.user._id.toString()) || null
            : null
        )
      ),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("Admin support error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch support tickets"
    });
  }
});

/**
 * GET /api/admin/support/:id
 * Get single ticket details
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate("user", "email name stripeCustomerId activeSubscriptionId subscriptionActive")
      .populate("resolvedBy", "email name");

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: "Ticket not found"
      });
    }

    const subscriptionContext = ticket.user?._id
      ? await Subscription.findOne({
          userId: ticket.user._id,
          status: { $in: ["active", "pending_activation", "past_due", "incomplete", "cancelled"] }
        }).sort({ updatedAt: -1 })
      : null;

    res.json({
      success: true,
      ticket: serializeTicket(ticket, subscriptionContext)
    });
  } catch (err) {
    console.error("Admin support detail error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch ticket details"
    });
  }
});

/**
 * PATCH /api/admin/support/:id
 * Update ticket (status, notes, etc.)
 */
router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const { status, adminNotes, priority, reply } = req.body;

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: "Ticket not found"
      });
    }

    // Handle admin reply
    if (reply && reply.trim()) {
      ticket.replies = ticket.replies || [];
      ticket.replies.push({
        message: reply.trim(),
        from: "admin",
        fromName: req.user?.name || "Admin",
        fromEmail: req.user?.email || "admin@otodial.com",
        createdAt: new Date()
      });

      const recipient = String(ticket.email || "").trim();
      if (recipient) {
        const base = frontBase();
        const ticketUrl = `${base}/support`;
        const mailResult = await sendEmailSafe(
          {
            to: recipient,
            subject: `Re: ${ticket.subject} — OTODIAL Support`,
            html: supportMessageEmail({
              name: ticket.name || recipient.split("@")[0] || "there",
              message: reply.trim(),
              subject: ticket.subject,
              ticketUrl,
            }),
            emailType: "support_reply",
            templateUsed: "supportMessageEmail",
          },
          "support_reply"
        );
        if (mailResult == null) {
          console.warn("⚠️ Support reply email not delivered (see Resend logs). Ticket reply was saved.");
        }
      }
    }

    // Handle status update
    if (status) {
      ticket.status = status;
      if (status === "resolved" || status === "closed") {
        ticket.resolvedAt = new Date();
        ticket.resolvedBy = req.userId;
      }
    }

    // Handle admin notes
    if (adminNotes !== undefined) {
      ticket.adminNotes = normalizeAdminNotesForWrite(adminNotes);
    }

    // Handle priority
    if (priority) {
      ticket.priority = priority;
    }

    await ticket.save();

    const updatedTicket = await SupportTicket.findById(req.params.id)
      .populate("resolvedBy", "email name")
      .populate("user", "email name stripeCustomerId activeSubscriptionId subscriptionActive");

    const subscriptionContext = updatedTicket.user?._id
      ? await Subscription.findOne({
          userId: updatedTicket.user._id,
          status: { $in: ["active", "pending_activation", "past_due", "incomplete", "cancelled"] }
        }).sort({ updatedAt: -1 })
      : null;

    res.json({
      success: true,
      message: "Ticket updated successfully",
      ticket: serializeTicket(updatedTicket, subscriptionContext)
    });
  } catch (err) {
    console.error("Admin support update error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to update ticket"
    });
  }
});

/**
 * POST /api/admin/support/:id/repair-subscription
 * Trigger Stripe -> MongoDB subscription repair from support ticket.
 */
router.post("/:id/repair-subscription", requireAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).populate(
      "user",
      "email name stripeCustomerId activeSubscriptionId subscriptionActive"
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: "Ticket not found"
      });
    }

    let targetUser = ticket.user || null;
    if (!targetUser && ticket.email) {
      targetUser = await User.findOne({ email: ticket.email });
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: "Ticket user not found"
      });
    }

    const repairResult = await repairUserSubscriptionFromStripe({
      userId: targetUser._id,
      reason: `support_ticket_${ticket._id}`
    });

    const noteLine = `[${new Date().toISOString()}] Repair Subscription by ${req.user?.email || req.userId}: ${
      repairResult.success ? "SUCCESS" : `FAILED (${repairResult.error || "unknown error"})`
    }`;
    ticket.adminNotes = [ticket.adminNotes, noteLine].filter(Boolean).join("\n");

    if (repairResult.success) {
      ticket.status = "resolved";
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = req.userId;
    } else {
      ticket.status = "in_progress";
    }

    await ticket.save();

    const refreshedTicket = await SupportTicket.findById(ticket._id)
      .populate("user", "email name stripeCustomerId activeSubscriptionId subscriptionActive")
      .populate("resolvedBy", "email name");

    const subscriptionContext = refreshedTicket.user?._id
      ? await Subscription.findOne({
          userId: refreshedTicket.user._id,
          status: { $in: ["active", "pending_activation", "past_due", "incomplete", "cancelled"] }
        }).sort({ updatedAt: -1 })
      : null;

    return res.json({
      success: repairResult.success,
      message: repairResult.success
        ? "Subscription repaired and ticket resolved"
        : "Repair attempt failed. Ticket kept for follow-up.",
      repairResult,
      ticket: serializeTicket(refreshedTicket, subscriptionContext)
    });
  } catch (err) {
    console.error("Admin support repair error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to repair subscription"
    });
  }
});

export default router;
