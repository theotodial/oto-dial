import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import SupportTicket from "../../models/SupportTicket.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import { repairUserSubscriptionFromStripe } from "../../services/stripeSubscriptionService.js";
import { sendIdentityApprovedEmail } from "../../services/identityVerificationEmailService.js";
import { sendSupportAdminReplyEmail } from "../../services/supportReplyEmailService.js";

const router = express.Router();

function serializeSupportReply(reply) {
  return {
    id: reply._id,
    message: reply.message,
    from: reply.from,
    fromName: reply.fromName,
    fromEmail: reply.fromEmail,
    createdAt: reply.createdAt,
    readAt: reply.readAt || null
  };
}

function countUnreadAdminReplies(replies = []) {
  return replies.filter((reply) => reply.from === "admin" && !reply.readAt).length;
}

function serializeTicket(ticket, subscriptionContext = null) {
  const replies = (ticket.replies || []).map(serializeSupportReply);
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
    replies,
    unreadAdminReplies: countUnreadAdminReplies(ticket.replies || []),
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    subscriptionStatus: subscriptionContext?.status || "none",
    stripeCustomerId: ticket.user?.stripeCustomerId || null,
    stripeSubscriptionId: subscriptionContext?.stripeSubscriptionId || null,
    activeSubscriptionId: ticket.user?.activeSubscriptionId || subscriptionContext?._id || null
  };
}

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

async function buildUserContextForTicket(ticket) {
  let userDoc = ticket.user?._id ? ticket.user : null;
  if (!userDoc && ticket.email) {
    userDoc = await User.findOne({ email: String(ticket.email).trim().toLowerCase() })
      .select(
        "_id email name firstName lastName status stripeCustomerId activeSubscriptionId isEmailVerified identityVerification.status features createdAt phone"
      )
      .lean();
  } else if (userDoc?._id) {
    userDoc = await User.findById(userDoc._id)
      .select(
        "_id email name firstName lastName status stripeCustomerId activeSubscriptionId isEmailVerified identityVerification.status features createdAt phone"
      )
      .lean();
  }

  if (!userDoc) return null;

  const [subscription, phoneNumbers] = await Promise.all([
    Subscription.findOne({
      userId: userDoc._id,
      status: { $in: ["active", "pending_activation", "past_due", "incomplete", "cancelled"] }
    })
      .sort({ updatedAt: -1 })
      .select("status planName stripeSubscriptionId limits numbers updatedAt")
      .lean(),
    PhoneNumber.find({ userId: userDoc._id })
      .select("phoneNumber status country countryCode countryName monthlyCost purchaseDate")
      .sort({ purchaseDate: -1 })
      .lean()
  ]);

  return {
    userId: userDoc._id,
    email: userDoc.email,
    name:
      userDoc.name ||
      `${userDoc.firstName || ""} ${userDoc.lastName || ""}`.trim() ||
      userDoc.email,
    phone: userDoc.phone || null,
    accountStatus: userDoc.status || "active",
    isEmailVerified: userDoc.isEmailVerified !== false,
    identityStatus: userDoc.identityVerification?.status || "not_submitted",
    stripeCustomerId: userDoc.stripeCustomerId || null,
    features: userDoc.features || {},
    createdAt: userDoc.createdAt,
    subscription: subscription
      ? {
          status: subscription.status,
          planName: subscription.planName || null,
          stripeSubscriptionId: subscription.stripeSubscriptionId || null,
          numbersLimit: subscription.limits?.numbersTotal ?? null,
          numbersUsed: Array.isArray(subscription.numbers) ? subscription.numbers.length : 0
        }
      : null,
    phoneNumbers: phoneNumbers.map((row) => ({
      id: row._id,
      number: row.phoneNumber,
      status: row.status,
      country: row.countryCode || row.country || row.countryName || null,
      monthlyCost: row.monthlyCost ?? null
    }))
  };
}

function serializeKycSummary(user) {
  const iv = user.identityVerification || {};
  const ai = iv.aiVerification || {};
  return {
    userId: user._id,
    email: user.email,
    name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    status: iv.status || "not_submitted",
    submittedAt: iv.submittedAt,
    reviewedAt: iv.reviewedAt,
    legalName: iv.legalName,
    dateOfBirth: iv.dateOfBirth,
    documentType: iv.documentType,
    documentCountry: iv.documentCountry,
    verificationType: iv.verificationType,
    aiDecision: ai.decision,
    aiOverallScore: ai.overallScore,
    autoApproved: ai.autoApproved === true,
    faceMatchScore: ai.faceMatchScore ?? iv.selfieLiveness?.faceMatchScore,
    livenessScore: ai.livenessScore ?? iv.selfieLiveness?.livenessScore,
    nameMatchScore: ai.nameMatchScore,
    hasIdDocument: Boolean(iv.idDocument),
    hasSelfie: Boolean(iv.selfieDocument),
  };
}

function serializeKycDetail(user) {
  const iv = user.identityVerification || {};
  const ai = iv.aiVerification || {};
  return {
    ...serializeKycSummary(user),
    phone: user.phone,
    company: user.company,
    addressLine1: iv.addressLine1,
    city: iv.city,
    stateRegion: iv.stateRegion,
    postalCode: iv.postalCode,
    rejectionReason: iv.rejectionReason,
    aiVerification: ai,
    selfieLiveness: iv.selfieLiveness,
    idDocument: iv.idDocument,
    idDocumentBack: iv.idDocumentBack,
    businessDocument: iv.businessDocument,
    selfieDocument: iv.selfieDocument,
    reviewedBy: iv.reviewedBy,
  };
}

/**
 * GET /api/admin/support/kyc
 * Identity verification queue for manual KYC review
 */
router.get("/kyc", requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = {
      "identityVerification.status": { $in: ["pending", "approved", "rejected"] },
    };

    if (status) {
      query["identityVerification.status"] = status;
    }

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { "identityVerification.legalName": { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .select("email name firstName lastName identityVerification createdAt")
      .sort({ "identityVerification.submittedAt": -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      verifications: users.map(serializeKycSummary),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error("Admin KYC list error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to fetch KYC queue" });
  }
});

/**
 * GET /api/admin/support/kyc/users/:userId
 */
router.get("/kyc/users/:userId", requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "email name firstName lastName phone company identityVerification createdAt"
    );
    if (!user || !user.identityVerification?.submittedAt) {
      return res.status(404).json({ success: false, error: "Verification not found" });
    }
    res.json({ success: true, verification: serializeKycDetail(user) });
  } catch (err) {
    console.error("Admin KYC detail error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to fetch KYC detail" });
  }
});

/**
 * PATCH /api/admin/support/kyc/users/:userId
 * Manual approve / reject
 */
router.patch("/kyc/users/:userId", requireAdmin, async (req, res) => {
  try {
    const { status, rejectionReason, adminNotes } = req.body;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status" });
    }

    const user = await User.findById(req.params.userId);
    if (!user?.identityVerification?.submittedAt) {
      return res.status(404).json({ success: false, error: "Verification not found" });
    }

    const wasApproved = user.identityVerification.status === "approved";
    user.identityVerification.status = status;
    user.identityVerification.reviewedAt = new Date();
    user.identityVerification.reviewedBy = req.userId;
    if (status === "rejected") {
      user.identityVerification.rejectionReason = String(rejectionReason || adminNotes || "Rejected by compliance review").trim();
    } else {
      user.identityVerification.rejectionReason = null;
    }

    if (!user.identityVerification.aiVerification) {
      user.identityVerification.aiVerification = {};
    }
    user.identityVerification.aiVerification.decision =
      status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending_manual";

    await user.save();

    if (status === "approved" && !wasApproved) {
      await sendIdentityApprovedEmail(user);
    }

    res.json({
      success: true,
      verification: serializeKycDetail(user),
      message: `Verification marked as ${status}`,
    });
  } catch (err) {
    console.error("Admin KYC update error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to update verification" });
  }
});

/**
 * GET /api/admin/support/stats
 * Queue counts for support dashboard
 */
router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const [open, inProgress, pendingKyc, total, resolved] = await Promise.all([
      SupportTicket.countDocuments({ status: "open" }),
      SupportTicket.countDocuments({ status: "in_progress" }),
      User.countDocuments({ "identityVerification.status": "pending" }),
      SupportTicket.countDocuments({}),
      SupportTicket.countDocuments({ status: { $in: ["resolved", "closed"] } })
    ]);

    return res.json({
      success: true,
      stats: {
        open,
        inProgress,
        actionable: open + inProgress,
        pendingKyc,
        total,
        resolved
      }
    });
  } catch (err) {
    console.error("Admin support stats error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch support stats"
    });
  }
});

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
      .populate("user", "email name stripeCustomerId activeSubscriptionId")
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
      .populate("user", "email name stripeCustomerId activeSubscriptionId")
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

    const userContext = await buildUserContextForTicket(ticket);

    res.json({
      success: true,
      ticket: serializeTicket(ticket, subscriptionContext),
      userContext
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
      const trimmedReply = reply.trim();
      ticket.replies = ticket.replies || [];
      ticket.replies.push({
        message: trimmedReply,
        from: "admin",
        fromName: req.user?.name || "Admin",
        fromEmail: req.user?.email || "admin@otodial.com",
        createdAt: new Date()
      });

      if (ticket.status === "open") {
        ticket.status = "in_progress";
      }

      await sendSupportAdminReplyEmail({
        to: ticket.email,
        name: ticket.name,
        adminMessage: trimmedReply,
        adminName: req.user?.name || "OTODIAL Support",
        subject: ticket.subject,
        ticketId: ticket._id,
      });
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
      .populate("user", "email name stripeCustomerId activeSubscriptionId");

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
      "email name stripeCustomerId activeSubscriptionId"
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
      .populate("user", "email name stripeCustomerId activeSubscriptionId")
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
