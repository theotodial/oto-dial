import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import axios from "axios";
import Campaign from "../models/Campaign.js";
import CampaignRecipient from "../models/CampaignRecipient.js";
import SMSTemplate from "../models/SMSTemplate.js";
import { normalizeSmsDestination } from "../utils/phoneNormalize.js";
import { scheduleCampaignSend } from "../services/campaignSendWorker.js";
import { getCampaignAnalytics } from "../services/campaignAnalyticsService.js";
import { extractTemplateKeys, renderMessage, findMissingVariables } from "../utils/campaignMessageRender.js";
import { countOptOutsForUser } from "../services/optOutService.js";
import OptOutList from "../models/OptOutList.js";
import json2csv from "json2csv";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const MAX_RECIPIENTS = 10000;
const PHONE_KEYS = ["phone", "mobile", "phonenumber", "phone_number", "msisdn", "tel"];

function isLikelyShortCode(value) {
  return /^\d{3,8}$/.test(String(value || "").replace(/\D/g, ""));
}

function normalizeCampaignPhone(raw) {
  const formatted = normalizeSmsDestination(raw);
  if (!formatted) return null;
  if (isLikelyShortCode(formatted)) return null;
  const digits = String(formatted).replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return formatted;
}

function rowToVariables(row, phoneVal) {
  const vars = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k || "").trim();
    if (!key) continue;
    const lk = key.toLowerCase().replace(/\s+/g, "");
    if (PHONE_KEYS.includes(lk)) continue;
    if (v != null && String(v).trim() !== "") {
      vars[key.trim()] = String(v).trim();
    }
  }
  return vars;
}

function findPhoneInRow(row) {
  for (const pk of PHONE_KEYS) {
    for (const key of Object.keys(row)) {
      if (String(key).toLowerCase().replace(/\s+/g, "") === pk) {
        return row[key];
      }
    }
  }
  const first = Object.values(row)[0];
  return first;
}

/**
 * Normalize `recipients` from JSON: string[] | { phone, variables }[] | { phone, name, ... }[]
 */
function parseRecipientsJson(recipients) {
  if (!Array.isArray(recipients)) return { list: [], invalid: [] };
  const seen = new Set();
  const list = [];
  const invalid = [];

  for (const item of recipients) {
    if (typeof item === "string") {
      const n = normalizeCampaignPhone(item);
      if (!n) {
        if (String(item || "").trim()) invalid.push(String(item).trim());
        continue;
      }
      const key = n.replace(/\D/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ phone: n, variables: {} });
      continue;
    }
    if (item && typeof item === "object") {
      const phoneRaw = item.phone ?? item.Phone ?? findPhoneInRow(item);
      const n = normalizeCampaignPhone(phoneRaw);
      if (!n) {
        if (String(phoneRaw || "").trim()) invalid.push(String(phoneRaw).trim());
        continue;
      }
      const key = n.replace(/\D/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      let variables = {};
      if (item.variables && typeof item.variables === "object" && !Array.isArray(item.variables)) {
        variables = { ...item.variables };
      } else {
        variables = rowToVariables(item, n);
      }
      list.push({ phone: n, variables });
    }
  }
  return { list, invalid };
}

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

// --- Static paths first ---

router.get("/templates", async (req, res) => {
  try {
    const list = await SMSTemplate.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ success: true, templates: list });
  } catch (err) {
    console.error("GET /campaign/templates:", err);
    return res.status(500).json({ success: false, error: "Failed to load templates" });
  }
});

router.post("/templates", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const content = String(req.body?.content || "").trim();
    if (!title || !content) {
      return res.status(400).json({ success: false, error: "title and content are required" });
    }
    const doc = await SMSTemplate.create({
      userId: req.userId,
      title,
      content,
    });
    return res.status(201).json({ success: true, template: doc });
  } catch (err) {
    console.error("POST /campaign/templates:", err);
    return res.status(500).json({ success: false, error: "Failed to create template" });
  }
});

router.delete("/templates/:templateId", async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return res.status(400).json({ success: false, error: "Invalid template id" });
    }
    const result = await SMSTemplate.deleteOne({
      _id: templateId,
      userId: req.userId,
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /campaign/templates:", err);
    return res.status(500).json({ success: false, error: "Failed to delete template" });
  }
});

router.patch("/templates/:templateId", async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      return res.status(400).json({ success: false, error: "Invalid template id" });
    }
    const titleRaw = req.body?.title;
    const contentRaw = req.body?.content;
    const updates = {};
    if (titleRaw !== undefined) {
      const title = String(titleRaw || "").trim();
      if (!title) {
        return res.status(400).json({ success: false, error: "title cannot be empty" });
      }
      updates.title = title;
    }
    if (contentRaw !== undefined) {
      const content = String(contentRaw || "").trim();
      if (!content) {
        return res.status(400).json({ success: false, error: "content cannot be empty" });
      }
      updates.content = content;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "Provide title and/or content" });
    }
    const doc = await SMSTemplate.findOneAndUpdate(
      { _id: templateId, userId: req.userId },
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    return res.json({ success: true, template: doc });
  } catch (err) {
    console.error("PATCH /campaign/templates:", err);
    return res.status(500).json({ success: false, error: "Failed to update template" });
  }
});

router.post("/ai-generate", async (req, res) => {
  try {
    const goal = String(req.body?.goal || "").trim();
    const audience = String(req.body?.audience || "").trim();
    const tone = String(req.body?.tone || "professional").trim();
    const key = String(process.env.OPENAI_API_KEY || "").trim();

    if (!goal) {
      return res.status(400).json({ success: false, error: "goal is required" });
    }

    if (!key) {
      const message = `Hi {{name}}, thanks for being ${audience || "a valued customer"}. ${goal}. Reply STOP to opt out.`;
      return res.json({
        success: true,
        message,
        placeholder: true,
        hint: "Set OPENAI_API_KEY for live AI copy.",
      });
    }

    const prompt = `Write one SMS marketing message (max 300 chars), US English, ${tone} tone.
Goal: ${goal}
Audience: ${audience || "customers"}
Use {{name}} or other {{variables}} where personalization helps. No emojis unless tone allows. Single message only, no quotes.`;

    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.OPENAI_CAMPAIGN_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write compliant SMS marketing copy. Include opt-out hint only if space." },
          { role: "user", content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    const text = r.data?.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      return res.status(502).json({ success: false, error: "Empty AI response" });
    }
    return res.json({ success: true, message: text });
  } catch (err) {
    console.error("POST /campaign/ai-generate:", err.response?.data || err.message);
    return res.status(502).json({
      success: false,
      error: err.response?.data?.error?.message || "AI generation failed",
    });
  }
});

router.get("/opt-outs/export", async (req, res) => {
  try {
    const rows = await OptOutList.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50000)
      .lean();
    const flat = rows.map((r) => ({ phone: r.phone, createdAt: r.createdAt }));
    const csvOut = json2csv.parse(flat, { fields: ["phone", "createdAt"] });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=\"opt-outs.csv\"");
    return res.send(csvOut);
  } catch (err) {
    console.error("GET /campaign/opt-outs/export:", err);
    return res.status(500).json({ success: false, error: "Export failed" });
  }
});

router.post("/import/csv", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: "file is required (field: file)" });
    }
    const rows = await parseCsvBuffer(req.file.buffer);
    if (rows.length > MAX_RECIPIENTS) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_RECIPIENTS} rows per CSV`,
      });
    }

    const name = String(req.body?.name || "").trim() || `Import ${new Date().toISOString().slice(0, 10)}`;
    const { list, invalid } = (() => {
      const seen = new Set();
      const out = [];
      const inv = [];
      for (const row of rows) {
        const phoneRaw = findPhoneInRow(row);
        const n = normalizeCampaignPhone(phoneRaw);
        if (!n) {
          if (String(phoneRaw || "").trim()) inv.push(String(phoneRaw).trim());
          continue;
        }
        const key = n.replace(/\D/g, "");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ phone: n, variables: rowToVariables(row, n) });
      }
      return { list: out, invalid: inv };
    })();

    if (!list.length) {
      return res.status(400).json({
        success: false,
        error: "No valid phone numbers in CSV",
        invalidSample: invalid.slice(0, 5),
      });
    }

    const campaign = await Campaign.create({
      userId: req.userId,
      name,
      status: "draft",
      totalRecipients: list.length,
      schedule: { type: "immediate", scheduledAt: null },
    });

    const docs = list.map((r) => ({
      campaignId: campaign._id,
      phone: r.phone,
      variables: r.variables,
      status: "pending",
    }));

    try {
      await CampaignRecipient.insertMany(docs, { ordered: false });
    } catch (e) {
      if (!e?.writeErrors?.length) throw e;
    }

    const inserted = await CampaignRecipient.countDocuments({ campaignId: campaign._id });
    await Campaign.findByIdAndUpdate(campaign._id, { totalRecipients: inserted });

    return res.status(201).json({
      success: true,
      campaign: await Campaign.findById(campaign._id).lean(),
      invalidCount: invalid.length,
      invalidSample: invalid.slice(0, 5),
    });
  } catch (err) {
    console.error("POST /campaign/import/csv:", err);
    return res.status(500).json({ success: false, error: "CSV import failed" });
  }
});

router.post("/preview-render", async (req, res) => {
  try {
    const template = String(req.body?.message || "");
    const variables = req.body?.variables && typeof req.body.variables === "object" ? req.body.variables : {};
    const keys = extractTemplateKeys(template);
    const missing = findMissingVariables(template, variables);
    return res.json({
      success: true,
      rendered: renderMessage(template, variables),
      keys,
      missing,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Preview failed" });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const { list, invalid } = parseRecipientsJson(req.body?.recipients);

    if (!name) {
      return res.status(400).json({ success: false, error: "name is required" });
    }
    if (!list.length) {
      return res.status(400).json({
        success: false,
        error: "At least one valid recipient is required",
        invalidSample: invalid.slice(0, 5),
      });
    }
    if (list.length > MAX_RECIPIENTS) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_RECIPIENTS} recipients per campaign`,
      });
    }

    const campaign = await Campaign.create({
      userId: req.userId,
      name,
      status: "draft",
      totalRecipients: list.length,
      schedule: { type: "immediate", scheduledAt: null },
    });

    const docs = list.map((r) => ({
      campaignId: campaign._id,
      phone: r.phone,
      variables: r.variables || {},
      status: "pending",
    }));

    try {
      await CampaignRecipient.insertMany(docs, { ordered: false });
    } catch (e) {
      if (!e?.writeErrors?.length) throw e;
    }

    const inserted = await CampaignRecipient.countDocuments({ campaignId: campaign._id });
    await Campaign.findByIdAndUpdate(campaign._id, { totalRecipients: inserted });

    return res.status(201).json({
      success: true,
      campaign: await Campaign.findById(campaign._id).lean(),
      invalidCount: invalid.length,
      invalidSample: invalid.slice(0, 5),
    });
  } catch (err) {
    console.error("POST /campaign:", err);
    return res.status(500).json({ success: false, error: "Failed to create campaign" });
  }
});

router.get("/", async (req, res) => {
  try {
    const [list, optOutTotal] = await Promise.all([
      Campaign.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean(),
      countOptOutsForUser(req.userId),
    ]);
    return res.json({ success: true, campaigns: list, optOutTotal });
  } catch (err) {
    console.error("GET /campaign:", err);
    return res.status(500).json({ success: false, error: "Failed to list campaigns" });
  }
});

router.get("/:campaignId/analytics", async (req, res) => {
  try {
    const { campaignId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({ success: false, error: "Invalid campaign id" });
    }
    const own = await Campaign.findOne({ _id: campaignId, userId: req.userId }).select("_id").lean();
    if (!own) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }
    const analytics = await getCampaignAnalytics(campaignId);
    return res.json({ success: true, ...analytics });
  } catch (err) {
    console.error("GET /campaign/:id/analytics:", err);
    return res.status(500).json({ success: false, error: "Failed to load analytics" });
  }
});

router.get("/:campaignId/recipients", async (req, res) => {
  try {
    const { campaignId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({ success: false, error: "Invalid campaign id" });
    }
    const own = await Campaign.findOne({ _id: campaignId, userId: req.userId }).select("_id").lean();
    if (!own) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 500;
    const recipients = await CampaignRecipient.find({ campaignId })
      .select("phone status variables")
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();
    return res.json({ success: true, recipients });
  } catch (err) {
    console.error("GET /campaign/:id/recipients:", err);
    return res.status(500).json({ success: false, error: "Failed to load recipients" });
  }
});

router.get("/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({ success: false, error: "Invalid campaign id" });
    }
    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: req.userId,
    }).lean();
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    const [pending, sent, failed, optedOut] = await Promise.all([
      CampaignRecipient.countDocuments({ campaignId, status: "pending" }),
      CampaignRecipient.countDocuments({ campaignId, status: "sent" }),
      CampaignRecipient.countDocuments({ campaignId, status: "failed" }),
      CampaignRecipient.countDocuments({ campaignId, status: "opted_out" }),
    ]);

    return res.json({
      success: true,
      campaign,
      progress: { pending, sent, failed, optedOut },
    });
  } catch (err) {
    console.error("GET /campaign/:id:", err);
    return res.status(500).json({ success: false, error: "Failed to load campaign" });
  }
});

router.post("/:campaignId/send", async (req, res) => {
  try {
    const { campaignId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      return res.status(400).json({ success: false, error: "Invalid campaign id" });
    }

    const message = String(req.body?.message || req.body?.text || "").trim();
    if (!message) {
      return res.status(400).json({ success: false, error: "message is required" });
    }

    const schedule = req.body?.schedule;
    const scheduledAtRaw = schedule?.scheduledAt;
    const scheduleType = schedule?.type === "scheduled" ? "scheduled" : "immediate";
    let scheduledAt = null;
    if (scheduleType === "scheduled" && scheduledAtRaw) {
      scheduledAt = new Date(scheduledAtRaw);
      if (Number.isNaN(scheduledAt.getTime())) {
        return res.status(400).json({ success: false, error: "Invalid scheduledAt" });
      }
    }

    const campaign = await Campaign.findOne({
      _id: campaignId,
      userId: req.userId,
    });

    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    if (campaign.status === "running") {
      return res.status(409).json({
        success: false,
        error: "Campaign is already sending",
      });
    }

    const pendingCount = await CampaignRecipient.countDocuments({
      campaignId,
      status: "pending",
    });
    if (pendingCount === 0) {
      return res.status(400).json({
        success: false,
        error: "No pending recipients to send",
      });
    }

    const now = new Date();
    const isFutureScheduled =
      scheduleType === "scheduled" && scheduledAt && scheduledAt.getTime() > now.getTime();

    if (isFutureScheduled) {
      campaign.messageBody = message;
      campaign.schedule = { type: "scheduled", scheduledAt };
      campaign.status = "draft";
      campaign.sendLock = false;
      campaign.sendLockedAt = null;
      await campaign.save();

      return res.status(202).json({
        success: true,
        scheduled: true,
        scheduledAt: scheduledAt.toISOString(),
        campaignId: campaign._id,
        pendingRecipients: pendingCount,
        message: "Campaign scheduled; sending starts automatically at the chosen time.",
      });
    }

    campaign.messageBody = message;
    campaign.status = "running";
    campaign.schedule = { type: "immediate", scheduledAt: null };
    campaign.sendLock = true;
    campaign.sendLockedAt = now;
    await campaign.save();

    scheduleCampaignSend(campaign._id, req.userId);

    return res.status(202).json({
      success: true,
      accepted: true,
      campaignId: campaign._id,
      pendingRecipients: pendingCount,
      message: "Campaign send started; progress updates as messages are delivered.",
    });
  } catch (err) {
    console.error("POST /campaign/:id/send:", err);
    return res.status(500).json({ success: false, error: "Failed to start send" });
  }
});

export default router;
