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
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
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
 * GET /api/contacts/lookup?phone=
 * Resolve a saved contact by phone (digits) for CRM sidebar / chat context.
 */
router.get("/lookup", async (req, res) => {
  try {
    const raw = String(req.query.phone || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      return res.json({ success: true, contact: null });
    }
    const contact = await Contact.findOne({
      userId: req.user._id,
      phoneNumber: digits,
    })
      .select("-__v")
      .lean();
    return res.json({ success: true, contact: contact || null });
  } catch (err) {
    console.error("GET /contacts/lookup error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

/**
 * POST /api/contacts
 * Create a new contact
 */
router.post("/", async (req, res) => {
  try {
    const { name, phoneNumber, email, notes, labels, pipelineStage, leadScore } = req.body;

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

    const labelArr = Array.isArray(labels)
      ? [...new Set(labels.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 20)
      : [];

    const stages = new Set(["new", "contacted", "qualified", "closed"]);
    const stage =
      pipelineStage !== undefined && stages.has(String(pipelineStage))
        ? String(pipelineStage)
        : "new";
    const score =
      leadScore !== undefined && Number.isFinite(Number(leadScore))
        ? Math.max(0, Math.min(999999, Math.floor(Number(leadScore))))
        : 0;

    const contact = new Contact({
      userId: req.user._id,
      name,
      phoneNumber: phoneNumber.replace(/\D/g, ''),
      email: email || "",
      notes: notes || "",
      labels: labelArr,
      pipelineStage: stage,
      leadScore: score,
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
 * POST /api/contacts/engagement
 * Increment lead score from tracked links (click / open). Contact must exist.
 */
router.post("/engagement", async (req, res) => {
  try {
    const phone = String(req.body?.phoneNumber || "").replace(/\D/g, "");
    const kind = String(req.body?.kind || "").toLowerCase();
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: "phoneNumber required" });
    }
    const inc = kind === "click" ? 20 : kind === "open" ? 5 : 0;
    if (!inc) {
      return res.status(400).json({ error: "kind must be click or open" });
    }
    const result = await Contact.updateOne(
      { userId: req.user._id, phoneNumber: phone },
      { $inc: { leadScore: inc } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Contact not found for this number" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("POST /contacts/engagement error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * PUT /api/contacts/:id
 * Update a contact
 */
router.put("/:id", async (req, res) => {
  try {
    const { name, email, notes, labels, pipelineStage, leadScore } = req.body;

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
    if (labels !== undefined) {
      contact.labels = Array.isArray(labels)
        ? [...new Set(labels.map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 20)
        : [];
    }
    if (pipelineStage !== undefined) {
      const stages = new Set(["new", "contacted", "qualified", "closed"]);
      const s = String(pipelineStage);
      if (stages.has(s)) contact.pipelineStage = s;
    }
    if (leadScore !== undefined && Number.isFinite(Number(leadScore))) {
      contact.leadScore = Math.max(0, Math.min(999999, Math.floor(Number(leadScore))));
    }

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
