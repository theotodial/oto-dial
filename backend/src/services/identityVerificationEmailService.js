import { sendEmailSafe } from "./email.service.js";
import {
  identityVerificationApprovedEmail,
  identityVerificationSubmittedEmail,
} from "../emails/templates.js";

export async function sendIdentitySubmittedEmail(user, { autoApproved = false } = {}) {
  const to = String(user?.email || "").trim();
  if (!to) return null;

  return sendEmailSafe(
    {
      to,
      subject: autoApproved
        ? "Identity verification submitted & verified — OTODIAL"
        : "Identity verification submitted — OTODIAL",
      html: identityVerificationSubmittedEmail({
        name: user?.name || user?.firstName || "there",
        autoApproved,
      }),
      emailType: "identity_verification_submitted",
      templateUsed: "identityVerificationSubmittedEmail",
    },
    "identity_verification_submitted"
  );
}

export async function sendIdentityApprovedEmail(user) {
  const to = String(user?.email || "").trim();
  if (!to) return null;

  return sendEmailSafe(
    {
      to,
      subject: "Your identity is verified — OTODIAL",
      html: identityVerificationApprovedEmail({
        name: user?.name || user?.firstName || "there",
      }),
      emailType: "identity_verification_approved",
      templateUsed: "identityVerificationApprovedEmail",
    },
    "identity_verification_approved"
  );
}
