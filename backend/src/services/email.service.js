import { Resend } from "resend";

const DEFAULT_FROM = "OTODIAL <no-reply@otodial.com>";
const DEFAULT_REPLY_TO = "info@otodial.com";

let resendSingleton = null;

/**
 * Resolved on each send so .env is always current after loadEnv runs first in index.js.
 * Production default: no-reply@otodial.com (domain must be verified in Resend).
 */
function resolveFromEmail() {
  const raw = String(process.env.RESEND_FROM || "").trim();
  if (raw) return raw;
  return DEFAULT_FROM;
}

function resolveReplyTo() {
  const raw = String(process.env.RESEND_REPLY_TO || "").trim();
  if (raw) return raw;
  return DEFAULT_REPLY_TO;
}

/**
 * Single Resend client for the process (API key from env after loadEnv).
 */
function getResendClient() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;
  if (!resendSingleton) {
    resendSingleton = new Resend(apiKey);
  }
  return resendSingleton;
}

/**
 * Call once from index.js after env is loaded — debug production sender issues.
 */
export function logResendConfigAtStartup() {
  const key = process.env.RESEND_API_KEY || "";
  console.log("🚀 RESEND KEY EXISTS:", Boolean(key.trim()));
  console.log("🔑 RESEND KEY PREFIX:", key ? key.slice(0, 5) : "(empty)");
  console.log("📧 FROM (RESEND_FROM):", process.env.RESEND_FROM || "(unset → default no-reply@otodial.com)");
  console.log("📧 Using sender:", resolveFromEmail());
  console.log("↩️ Reply-To:", resolveReplyTo());
}

/**
 * Replace {{key}} placeholders in HTML (beginner-friendly template syntax).
 * Unknown keys become an empty string.
 */
export function applyTemplateVars(html, vars = {}) {
  if (!html || typeof html !== "string") return "";
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/**
 * Send email via Resend. Throws on failure (use sendEmailSafe in non-critical paths).
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.emailType] — for logs (e.g. verification, welcome)
 */
export async function sendEmail({
  to,
  subject,
  html,
  emailType = "transactional",
  templateUsed,
}) {
  const FROM_EMAIL = resolveFromEmail();
  const replyTo = resolveReplyTo();

  if (templateUsed) {
    console.log("📨 Template used:", templateUsed);
  }
  console.log(`📧 Sending email → ${emailType} → ${to}`);

  const resend = getResendClient();
  if (!resend) {
    const err = new Error("RESEND_API_KEY is missing or empty");
    console.error(`❌ Email failed → ${emailType} → ${to}:`, err.message);
    throw err;
  }

  if (!to || !subject || !html) {
    const err = new Error("Missing to, subject, or html");
    console.error(`❌ Email failed → ${emailType} → ${to}:`, err.message);
    throw err;
  }

  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      replyTo,
      subject,
      html,
    });

    console.log(`✅ Email success → ${emailType} → ${to}`);
    return response;
  } catch (error) {
    console.error(`❌ Email failed → ${emailType} → ${to}:`, error?.message || String(error));
    throw error;
  }
}

/**
 * Non-critical paths: does not throw; logs errors.
 */
export async function sendEmailSafe(payload, label = "email") {
  try {
    return await sendEmail({
      ...payload,
      emailType: payload.emailType || label,
    });
  } catch (e) {
    console.error(`Email failed [sendEmailSafe:${label}]:`, e?.message || String(e));
    return null;
  }
}
