import { sendEmailSafe } from "./email.service.js";
import { frontBase, supportAdminReplyEmail } from "../emails/templates.js";

export async function sendSupportAdminReplyEmail({
  to,
  name,
  adminMessage,
  adminName,
  subject,
  ticketId,
}) {
  const recipient = String(to || "").trim();
  const message = String(adminMessage || "").trim();
  if (!recipient || !message) return null;

  const base = frontBase();
  const ticketUrl = ticketId
    ? `${base}/support?ticket=${encodeURIComponent(String(ticketId))}`
    : `${base}/support`;

  const ticketSubject = String(subject || "").trim() || "Support request";

  return sendEmailSafe(
    {
      to: recipient,
      subject: `Re: ${ticketSubject} — OTODIAL Support`,
      html: supportAdminReplyEmail({
        name: name || recipient.split("@")[0] || "there",
        adminMessage: message,
        adminName: adminName || "OTODIAL Support",
        subject: ticketSubject,
        ticketUrl,
      }),
      emailType: "support_admin_reply",
      templateUsed: "supportAdminReplyEmail",
    },
    "support_admin_reply"
  );
}
