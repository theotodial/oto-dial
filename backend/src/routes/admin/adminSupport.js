import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import SupportTicket from "../../models/SupportTicket.js";

const router = express.Router();

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
      .populate("user", "email name")
      .populate("resolvedBy", "email name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SupportTicket.countDocuments(query);

    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        userId: ticket.user?._id,
        userEmail: ticket.user?.email || ticket.email,
        userName: ticket.user?.name || ticket.name,
        name: ticket.name,
        email: ticket.email,
        phone: ticket.phone,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        priority: ticket.priority,
        adminNotes: ticket.adminNotes,
        resolvedBy: ticket.resolvedBy?._id,
        resolvedByName: ticket.resolvedBy?.name,
        resolvedAt: ticket.resolvedAt,
        replies: ticket.replies || [],
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt
      })),
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
      .populate("user", "email name")
      .populate("resolvedBy", "email name");

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: "Ticket not found"
      });
    }

    res.json({
      success: true,
      ticket: {
        id: ticket._id,
        userId: ticket.user?._id,
        userEmail: ticket.user?.email || ticket.email,
        userName: ticket.user?.name || ticket.name,
        name: ticket.name,
        email: ticket.email,
        phone: ticket.phone,
        subject: ticket.subject,
        message: ticket.message,
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
        updatedAt: ticket.updatedAt
      }
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
        fromName: req.adminUser?.name || "Admin",
        fromEmail: req.adminUser?.email || "admin@otodial.com",
        createdAt: new Date()
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
      ticket.adminNotes = adminNotes;
    }

    // Handle priority
    if (priority) {
      ticket.priority = priority;
    }

    await ticket.save();

    const updatedTicket = await SupportTicket.findById(req.params.id)
      .populate("resolvedBy", "email name")
      .populate("user", "email name");

    res.json({
      success: true,
      message: "Ticket updated successfully",
      ticket: {
        id: updatedTicket._id,
        userId: updatedTicket.user?._id,
        userEmail: updatedTicket.user?.email || updatedTicket.email,
        userName: updatedTicket.user?.name || updatedTicket.name,
        name: updatedTicket.name,
        email: updatedTicket.email,
        phone: updatedTicket.phone,
        subject: updatedTicket.subject,
        message: updatedTicket.message,
        status: updatedTicket.status,
        priority: updatedTicket.priority,
        adminNotes: updatedTicket.adminNotes,
        resolvedBy: updatedTicket.resolvedBy?._id,
        resolvedByName: updatedTicket.resolvedBy?.name,
        resolvedAt: updatedTicket.resolvedAt,
        businessCategory: updatedTicket.businessCategory,
        businessDescription: updatedTicket.businessDescription,
        serviceRequest: updatedTicket.serviceRequest,
        isUrgent: updatedTicket.isUrgent,
        replies: updatedTicket.replies || [],
        createdAt: updatedTicket.createdAt,
        updatedAt: updatedTicket.updatedAt
      }
    });
  } catch (err) {
    console.error("Admin support update error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to update ticket"
    });
  }
});

export default router;
