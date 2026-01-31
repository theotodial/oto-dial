import express from "express";
import UserContact from "../models/UserContact.js";

const router = express.Router();

/**
 * GET /api/contacts
 * List all contacts for the current user
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.userId;
    const contacts = await UserContact.find({ user: userId })
      .sort({ name: 1 })
      .lean();
    res.json({
      success: true,
      contacts: contacts.map((c) => ({
        id: c._id,
        _id: c._id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        label: c.label || "",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }))
    });
  } catch (err) {
    console.error("GET /api/contacts error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch contacts" });
  }
});

/**
 * POST /api/contacts
 * Create a contact (or upsert by phoneNumber for same user)
 */
router.post("/", async (req, res) => {
  try {
    const userId = req.userId;
    const { name, phoneNumber, label } = req.body;
    const normalized = (phoneNumber || "").replace(/\D/g, "");
    if (!name || !normalized) {
      return res.status(400).json({
        success: false,
        error: "name and phoneNumber are required"
      });
    }
    const trimPhone = (phoneNumber || "").trim();
    let existingContact = await UserContact.findOne({ user: userId, phoneNumber: trimPhone });
    if (!existingContact && normalized) {
      const all = await UserContact.find({ user: userId }).lean();
      const match = all.find((c) => (c.phoneNumber || "").replace(/\D/g, "") === normalized);
      existingContact = match ? await UserContact.findById(match._id) : null;
    }
    let contact;
    if (existingContact) {
      existingContact.name = (name || existingContact.name).trim();
      existingContact.phoneNumber = (phoneNumber || existingContact.phoneNumber).trim();
      if (label !== undefined) existingContact.label = (label || "").trim();
      await existingContact.save();
      contact = existingContact;
    } else {
      contact = await UserContact.create({
        user: userId,
        name: (name || "").trim(),
        phoneNumber: (phoneNumber || "").trim(),
        label: (label || "").trim()
      });
    }
    res.status(existingContact ? 200 : 201).json({
      success: true,
      contact: {
        id: contact._id,
        _id: contact._id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        label: contact.label || "",
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt
      }
    });
  } catch (err) {
    console.error("POST /api/contacts error:", err);
    res.status(500).json({ success: false, error: "Failed to save contact" });
  }
});

/**
 * PUT /api/contacts/:id
 * Update a contact by id
 */
router.put("/:id", async (req, res) => {
  try {
    const userId = req.userId;
    const { name, phoneNumber, label } = req.body;
    const contact = await UserContact.findOne({ _id: req.params.id, user: userId });
    if (!contact) {
      return res.status(404).json({ success: false, error: "Contact not found" });
    }
    if (name !== undefined) contact.name = (name || "").trim();
    if (phoneNumber !== undefined) contact.phoneNumber = (phoneNumber || "").trim();
    if (label !== undefined) contact.label = (label || "").trim();
    await contact.save();
    res.json({
      success: true,
      contact: {
        id: contact._id,
        _id: contact._id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        label: contact.label || "",
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt
      }
    });
  } catch (err) {
    console.error("PUT /api/contacts/:id error:", err);
    res.status(500).json({ success: false, error: "Failed to update contact" });
  }
});

/**
 * DELETE /api/contacts/:id
 * Delete a contact by id
 */
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.userId;
    const contact = await UserContact.findOneAndDelete({ _id: req.params.id, user: userId });
    if (!contact) {
      return res.status(404).json({ success: false, error: "Contact not found" });
    }
    res.json({ success: true, deleted: true });
  } catch (err) {
    console.error("DELETE /api/contacts/:id error:", err);
    res.status(500).json({ success: false, error: "Failed to delete contact" });
  }
});

/**
 * POST /api/contacts/import
 * Bulk create/update contacts (e.g. from device)
 */
router.post("/import", async (req, res) => {
  try {
    const userId = req.userId;
    const { contacts: list } = req.body;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(400).json({ success: false, error: "contacts array required" });
    }
    const norm = (p) => (p || "").replace(/\D/g, "");
    const existingList = await UserContact.find({ user: userId }).lean();
    const results = [];
    for (const item of list) {
      const name = (item.name || item.displayName || "").trim();
      const phoneNumber = (item.phoneNumber || item.phone || item.tel || "").trim().replace(/\s/g, "");
      if (!name || !phoneNumber) continue;
      const normalized = norm(phoneNumber);
      const existing = existingList.find((c) => norm(c.phoneNumber) === normalized);
      if (existing) {
        const doc = await UserContact.findById(existing._id);
        if (doc) {
          doc.name = name;
          if (item.label !== undefined) doc.label = (item.label || "").trim();
          await doc.save();
          results.push({ id: doc._id, name: doc.name, phoneNumber: doc.phoneNumber, updated: true });
        }
      } else {
        const created = await UserContact.create({
          user: userId,
          name,
          phoneNumber,
          label: (item.label || "").trim()
        });
        existingList.push({ _id: created._id, phoneNumber: created.phoneNumber });
        results.push({ id: created._id, name: created.name, phoneNumber: created.phoneNumber, created: true });
      }
    }
    res.json({ success: true, imported: results.length, contacts: results });
  } catch (err) {
    console.error("POST /api/contacts/import error:", err);
    res.status(500).json({ success: false, error: "Failed to import contacts" });
  }
});

export default router;
