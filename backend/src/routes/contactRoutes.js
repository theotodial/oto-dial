import express from "express";
import Contact from "../models/Contact.js";

const router = express.Router();

/**
 * GET /api/contacts
 * Get all contacts for the authenticated user
 */
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 20);
    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      Contact.find({ userId: req.user._id })
        .sort({ name: 1 })
        .select("-__v")
        .skip(skip)
        .limit(limit)
        .lean(),
      Contact.countDocuments({ userId: req.user._id })
    ]);

    return res.json({
      success: true,
      contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (err) {
    console.error("GET /contacts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /api/contacts
 * Create a new contact
 */
router.post("/", async (req, res) => {
  try {
    const { name, phoneNumber, email, notes } = req.body;

    if (!name || !phoneNumber) {
      return res.status(400).json({ error: "Name and phone number are required" });
    }

    // Check if contact already exists
    const existing = await Contact.findOne({
      userId: req.user._id,
      phoneNumber: phoneNumber.replace(/\D/g, '') // Normalize phone number
    });

    if (existing) {
      return res.status(400).json({ error: "Contact with this phone number already exists" });
    }

    const contact = new Contact({
      userId: req.user._id,
      name,
      phoneNumber: phoneNumber.replace(/\D/g, ''),
      email: email || "",
      notes: notes || ""
    });

    await contact.save();

    return res.json({
      success: true,
      contact
    });
  } catch (err) {
    console.error("POST /contacts error:", err);
    if (err.code === 11000) {
      return res.status(400).json({ error: "Contact with this phone number already exists" });
    }
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * PUT /api/contacts/:id
 * Update a contact
 */
router.put("/:id", async (req, res) => {
  try {
    const { name, email, notes } = req.body;

    const contact = await Contact.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    if (name !== undefined) contact.name = name;
    if (email !== undefined) contact.email = email;
    if (notes !== undefined) contact.notes = notes;

    await contact.save();

    return res.json({
      success: true,
      contact
    });
  } catch (err) {
    console.error("PUT /contacts/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * DELETE /api/contacts/:id
 * Delete a contact
 */
router.delete("/:id", async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    return res.json({
      success: true,
      message: "Contact deleted successfully"
    });
  } catch (err) {
    console.error("DELETE /contacts/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
