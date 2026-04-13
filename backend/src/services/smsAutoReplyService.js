import axios from "axios";
import User from "../models/User.js";
import Contact from "../models/Contact.js";
import { sendOutboundSms } from "./smsOutboundService.js";
import { featuresMatchMiddleware } from "../utils/userFeatures.js";

function normDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/**
 * +10 lead score when an existing contact replies (inbound SMS).
 */
export async function bumpLeadScoreOnInboundReply(userId, fromE164) {
  const digits = normDigits(fromE164);
  if (!digits || digits.length < 10 || !userId) return;
  try {
    await Contact.updateOne(
      { userId, phoneNumber: digits },
      { $inc: { leadScore: 10 } }
    );
  } catch {
    /* non-fatal */
  }
}

async function generateAiSmsReply(inboundText, extraPrompt) {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    return "Thanks for your message — we'll follow up shortly.";
  }
  const system =
    "You write short SMS replies (max 300 characters), plain text, no markdown, US English. Be helpful and concise.";
  const userMsg = `Customer wrote:\n${String(inboundText || "").slice(0, 800)}\n\n${extraPrompt ? `Instructions: ${extraPrompt}\n` : ""}Reply with one SMS only.`;
  try {
    const r = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.OPENAI_AUTO_REPLY_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        max_tokens: 200,
        temperature: 0.5,
      },
      {
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        timeout: 25000,
      }
    );
    const text = String(r.data?.choices?.[0]?.message?.content || "").trim().slice(0, 320);
    return text || "Thanks for your message.";
  } catch (err) {
    console.warn("Auto-reply AI failed:", err?.response?.data?.error?.message || err?.message);
    return "";
  }
}

/**
 * Keyword / fallback / optional AI auto-reply for inbound SMS (Pro / campaign-enabled accounts).
 */
export async function maybeAutoReplyInbound({ userId, customerFrom, messageText }) {
  if (!userId || !customerFrom) return;

  const user = await User.findById(userId)
    .select("messagingAutomation features")
    .lean();
  if (!user) return;

  if (!featuresMatchMiddleware(user, "campaign")) return;
  const ma = user.messagingAutomation || {};
  if (!ma.autoReplyEnabled) return;

  const rules = Array.isArray(ma.autoReplyRules) ? ma.autoReplyRules : [];
  if (!rules.length) return;

  const body = String(messageText || "").trim();
  const lower = body.toLowerCase();

  const specifics = rules.filter((r) => r && !r.isFallback);
  const fallbacks = rules.filter((r) => r && r.isFallback);

  let chosen = null;
  for (const r of specifics) {
    const kw = String(r.keyword || "").trim().toLowerCase();
    if (!kw || kw === "*") continue;
    if (lower.includes(kw)) {
      chosen = r;
      break;
    }
  }
  if (!chosen && fallbacks.length) {
    chosen = fallbacks[0];
  }
  if (!chosen) {
    const anyRule = rules.find((r) => {
      const kw = String(r?.keyword || "").trim().toLowerCase();
      return kw === "*" || kw === "";
    });
    chosen = anyRule || null;
  }
  if (!chosen) return;

  let text = String(chosen.response || "").trim();
  if (chosen.useAi) {
    const aiText = await generateAiSmsReply(body, String(chosen.aiPrompt || "").trim());
    if (aiText) text = aiText;
  }
  if (!text) return;

  const result = await sendOutboundSms({ userId, to: customerFrom, text });
  if (!result.ok) {
    console.warn("Auto-reply send failed:", result.error);
  }
}
