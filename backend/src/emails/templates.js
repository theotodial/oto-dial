/**
 * OTODIAL transactional email HTML — all templates live in code (not Resend dashboard).
 * Use ${...} interpolation; user-supplied text is escaped via escHtml / escAttr.
 */

const LOGO_URL = "https://otodial.com/assets/otodial-logo-D3kxwFp8.png";

export function frontBase() {
  return String(process.env.FRONTEND_URL || process.env.APP_URL || "https://otodial.com").replace(
    /\/+$/,
    ""
  );
}

export function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveName(input, fallback = "there") {
  if (input == null) return escHtml(fallback);
  if (typeof input === "string") return escHtml(input.trim() || fallback);
  const n = input?.name;
  return escHtml(String(n ?? "").trim() || fallback);
}

function emailHeader() {
  return `<tr>
              <td style="background:#0f172a; padding:20px 24px;">
                <table width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${LOGO_URL}" width="40" alt="OTODIAL" style="display:block;" />
                    </td>
                    <td style="padding-left:10px; vertical-align:middle;">
                      <span style="color:#fff; font-size:28px; font-weight:600;">OTODIAL</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

function emailFooter() {
  return `<tr>
              <td style="background:#f1f5f9; padding:20px; text-align:center; font-size:12px; color:#64748b;">
                © 2026 OTODIAL. All rights reserved.
              </td>
            </tr>`;
}

function shell(bodyRows) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0; background:#f4f6f8; font-family:Arial, sans-serif;">
    <table width="100%" style="padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" style="background:#fff; border-radius:10px; overflow:hidden; max-width:100%;">
            ${emailHeader()}
            ${bodyRows}
            ${emailFooter()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** 1 — Welcome */
export function welcomeEmail(input) {
  const name = resolveName(input);
  const home = escAttr(`${frontBase()}/`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">Welcome to OTODIAL 🚀</h2>
                <p>Hi ${name},</p>
                <p>You’ve just unlocked a smarter, more affordable way to run your calling operations.</p>
                <p>
                  OTODIAL is built for businesses tired of expensive dialers that require VPNs, LLC setups, and complex
                  configurations.
                </p>
                <p>With OTODIAL, you get:</p>
                <ul style="padding-left:20px; color:#334155;">
                  <li>⚡ Fast and reliable cloud dialing</li>
                  <li>💰 Affordable pricing (no hidden costs)</li>
                  <li>🌍 No VPN or LLC required</li>
                  <li>📞 Dedicated number with every plan</li>
                </ul>
                <p>
                  Whether you're starting out or scaling your outreach, OTODIAL gives you everything you need without
                  the usual headaches.
                </p>
                <div style="text-align:center; margin:30px;">
                  <a href="${home}" style="background:#2563eb; color:#fff; padding:12px 24px; text-decoration:none; border-radius:6px; display:inline-block;">
                    Explore Plans
                  </a>
                </div>
                <p>Upgrade your plan today and start dialing without limits.</p>
              </td>
            </tr>`);
}

/** 2 — Payment success */
export function paymentSuccessEmail(opts = {}) {
  const dashboardUrl = escAttr(opts.dashboardUrl || `${frontBase()}/dashboard`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#16a34a;">Payment Successful ✅</h2>
                <p>Your subscription is now active.</p>
                <p>You now have full access to OTODIAL’s dialing system and features.</p>
                <p>
                  Start making calls, manage your leads efficiently, and scale your operations without worrying about
                  high costs.
                </p>
                <div style="text-align:center; margin:30px;">
                  <a href="${dashboardUrl}" style="background:#16a34a; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">
                    Open Dashboard
                  </a>
                </div>
              </td>
            </tr>`);
}

/** 3 — Payment failed */
export function paymentFailedEmail(opts = {}) {
  const billingUrl = escAttr(opts.billingUrl || `${frontBase()}/billing`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#dc2626;">Payment Failed ⚠️</h2>
                <p>We were unable to process your recent payment.</p>
                <p>Your service may be interrupted if the issue is not resolved.</p>
                <p>Don’t lose access to your dialing system — update your payment method now.</p>
                <div style="text-align:center; margin:30px;">
                  <a href="${billingUrl}" style="background:#dc2626; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">
                    Fix Payment
                  </a>
                </div>
              </td>
            </tr>`);
}

/** 4 — New device / login */
export function newDeviceEmail({ name, ip, device } = {}) {
  const displayName = escHtml(name || "there");
  const ipSafe = escHtml(ip || "unknown");
  const deviceSafe = device ? `<p><strong>Device:</strong> ${escHtml(device)}</p>` : "";
  const securityUrl = escAttr(`${frontBase()}/profile`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">New Login Detected 🔐</h2>
                <p>Hi ${displayName},</p>
                <p>We detected a login from a new device.</p>
                <p><strong>IP Address:</strong> ${ipSafe}</p>
                ${deviceSafe}
                <p>If this was not you, please secure your account immediately.</p>
                <div style="text-align:center; margin:30px;">
                  <a href="${securityUrl}" style="background:#2563eb; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">
                    Account settings
                  </a>
                </div>
              </td>
            </tr>`);
}

/** 5 — Pricing / no subscription */
export function pricingEmail(input) {
  const name = resolveName(input);
  const upgradeUrl = escAttr(`${frontBase()}/billing`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">Choose the Right Plan for You 🚀</h2>
                <p>Hi ${name},</p>
                <p>Whether you're just starting or scaling aggressively, OTODIAL has a plan built for your needs.</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;" />
                <h3 style="color:#0f172a;">Basic Plan</h3>
                <p>✔ 1500 Minutes<br />✔ 100 SMS<br />✔ 1 Free Virtual Number</p>
                <h3 style="color:#0f172a;">Super Plan</h3>
                <p>✔ 2500 Minutes<br />✔ 200 SMS<br />✔ 1 Free Virtual Number</p>
                <h3 style="color:#0f172a;">Unlimited Call Plan</h3>
                <p>✔ Unlimited Calling Minutes<br />✔ 1 Free Virtual Number<br />❌ No SMS Included</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;" />
                <h3 style="color:#0f172a;">Add-ons</h3>
                <p>
                  ➕ 700 Minutes – $9.99<br />
                  ➕ 500 SMS – $9.99
                </p>
                <div style="text-align:center; margin:30px;">
                  <a href="${upgradeUrl}" style="background:#2563eb; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; display:inline-block;">
                    Upgrade Now
                  </a>
                </div>
                <p>Stop paying for expensive dialers that require VPNs and LLCs. Switch to OTODIAL today.</p>
              </td>
            </tr>`);
}

/**
 * 6 — Email verification (correct content — not pricing).
 * @param {object} opts — { name, link } or legacy { name, verification_link }
 */
export function verificationEmail(opts = {}) {
  const name = resolveName(opts);
  const rawLink = opts.link || opts.verification_link || "#";
  const link = escAttr(rawLink);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">Verify Your Email</h2>
                <p>Hi ${name},</p>
                <p>Please confirm your email address by clicking the button below. This link expires in <strong>15 minutes</strong>.</p>
                <div style="text-align:center; margin:30px;">
                  <a href="${link}" style="background:#2563eb; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:600;">
                    Verify Email
                  </a>
                </div>
                <p style="font-size:14px; color:#64748b;">If you did not create an OTODIAL account, you can ignore this message.</p>
              </td>
            </tr>`);
}

/** 7 — Password reset */
export function resetPasswordEmail(opts = {}) {
  const name = resolveName(opts);
  const rawLink = opts.link || opts.reset_link || "#";
  const link = escAttr(rawLink);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">Reset Your Password 🔐</h2>
                <p>Hi ${name},</p>
                <p>We received a request to reset your password.</p>
                <div style="text-align:center; margin:30px;">
                  <a href="${link}" style="background:#2563eb; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:600;">
                    Reset Password
                  </a>
                </div>
                <p style="font-size:14px; color:#64748b;">If you didn’t request this, you can safely ignore this email.</p>
              </td>
            </tr>`);
}

/** After password successfully changed */
export function passwordResetSuccessEmail(input) {
  const name = resolveName(input);
  const loginUrl = escAttr(`${frontBase()}/login`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#16a34a;">Password updated ✅</h2>
                <p>Hi ${name},</p>
                <p>Your OTODIAL password was changed successfully. If this was you, no further action is needed.</p>
                <p style="font-size:14px; color:#64748b;">If you did not make this change, contact <a href="mailto:info@otodial.com">info@otodial.com</a> immediately.</p>
                <div style="text-align:center; margin:24px 0;">
                  <a href="${loginUrl}" style="background:#2563eb; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">Sign in</a>
                </div>
              </td>
            </tr>`);
}

/** 8 — Low balance / usage */
export function lowBalanceEmail({ name, minutes, sms } = {}) {
  const displayName = escHtml(name || "there");
  const m = escHtml(minutes ?? "—");
  const s = escHtml(sms ?? "—");
  const billingUrl = escAttr(`${frontBase()}/billing`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">You're Running Low ⚠️</h2>
                <p>Hi ${displayName},</p>
                <p>You are close to reaching your plan limits.</p>
                <p>
                  Voice usage: <strong>${m}</strong><br />
                  SMS usage: <strong>${s}</strong>
                </p>
                <p>Avoid interruptions by upgrading your plan or adding more resources.</p>
                <div style="text-align:center; margin:30px;">
                  <a href="${billingUrl}" style="background:#2563eb; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; display:inline-block;">
                    Upgrade Now
                  </a>
                </div>
              </td>
            </tr>`);
}

/** 9 — Upgrade prompt */
export function upgradePlanEmail(input) {
  const name = resolveName(input);
  const plansUrl = escAttr(`${frontBase()}/billing`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">Upgrade Your Plan 🚀</h2>
                <p>Hi ${name},</p>
                <p>You're getting great value from OTODIAL — now it's time to scale.</p>
                <p>Upgrade your plan to unlock more minutes, more SMS, and uninterrupted calling.</p>
                <div style="text-align:center; margin:30px;">
                  <a href="${plansUrl}" style="background:#2563eb; color:#fff; padding:14px 28px; border-radius:6px; text-decoration:none; display:inline-block;">
                    View Plans
                  </a>
                </div>
              </td>
            </tr>`);
}

/**
 * 10 — Support reply to user
 * @param {object} opts — { name, message, subject?, ticketUrl? }
 */
export function supportMessageEmail({ name, message, subject, ticketUrl } = {}) {
  const displayName = escHtml(name || "there");
  const subj = subject ? `<p style="color:#64748b;font-size:14px;"><strong>Ticket:</strong> ${escHtml(subject)}</p>` : "";
  const bodyHtml = escHtml(message || "").replace(/\r\n/g, "\n").split("\n").join("<br/>");
  const supportPath = escAttr(ticketUrl || `${frontBase()}/support`);
  return shell(`<tr>
              <td style="padding:30px;">
                <h2 style="color:#0f172a;">Message from OTODIAL Support</h2>
                <p>Hi ${displayName},</p>
                ${subj}
                <p style="margin-top:16px; line-height:1.6; color:#334155;">${bodyHtml}</p>
                <div style="text-align:center; margin:28px 0;">
                  <a href="${supportPath}" style="background:#2563eb; color:#fff; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">
                    View support tickets
                  </a>
                </div>
                <p style="font-size:13px; color:#64748b;">Reply to this email or open the support page if you have follow-up questions.</p>
              </td>
            </tr>`);
}

// --- Legacy / compatibility aliases (older imports) ---

export function getWelcomeEmail(name) {
  return welcomeEmail({ name });
}

export function getVerificationEmail(name, link) {
  return verificationEmail({ name, link });
}

export function getResetPasswordEmail(name, link) {
  return resetPasswordEmail({ name, link });
}

export function getPasswordResetSuccessEmail(name) {
  return passwordResetSuccessEmail({ name });
}

export function getPaymentSuccessEmail(opts = {}) {
  return paymentSuccessEmail({
    dashboardUrl: opts.dashboardUrl || `${frontBase()}/dashboard`,
  });
}

export function getPaymentFailedEmail(opts = {}) {
  return paymentFailedEmail({
    billingUrl: opts.updatePaymentUrl || opts.billingUrl || `${frontBase()}/billing`,
  });
}

export function getPricingEmail(name) {
  return pricingEmail({ name });
}

export function newDeviceLoginEmail({ name, ip, userAgent }) {
  return newDeviceEmail({ name, ip, device: userAgent });
}

export function usageWarningEmail({ name, minutes, sms }) {
  return lowBalanceEmail({ name, minutes, sms });
}
