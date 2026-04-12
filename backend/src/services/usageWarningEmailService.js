import User from "../models/User.js";
import { sendEmailSafe } from "./email.service.js";
import { lowBalanceEmail, upgradePlanEmail } from "../emails/templates.js";

const WARNING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const UPGRADE_PROMPT_COOLDOWN_MS = 5 * 24 * 60 * 60 * 1000;
const UPGRADE_USAGE_THRESHOLD = 0.92;

/**
 * If voice or SMS usage is above 80%, send low-balance-style email (at most once per cooldown per user).
 * If usage ≥ 92%, also send upgrade prompt (separate cooldown).
 * Fire-and-forget: never throws to caller.
 */
export async function maybeSendUsageWarningEmail(userId, { minutesPercent, smsPercent, userEmail, displayName }) {
  try {
    const voiceHigh = typeof minutesPercent === "number" && minutesPercent >= 0.8;
    const smsHigh = typeof smsPercent === "number" && smsPercent >= 0.8;
    if (!voiceHigh && !smsHigh) return;

    const user = await User.findById(userId)
      .select("lastUsageWarningEmailAt lastUpgradePlanEmailAt email name firstName")
      .lean();
    if (!user?.email) return;

    const name = displayName || user.name || user.firstName || "there";
    const to = userEmail || user.email;

    const minutesLabel =
      typeof minutesPercent === "number"
        ? `${Math.round(minutesPercent * 100)}% of voice allowance`
        : "—";
    const smsLabel =
      typeof smsPercent === "number" ? `${Math.round(smsPercent * 100)}% of SMS allowance` : "—";

    const last = user.lastUsageWarningEmailAt ? new Date(user.lastUsageWarningEmailAt).getTime() : 0;
    if (Date.now() - last >= WARNING_COOLDOWN_MS) {
      const sent = await sendEmailSafe(
        {
          to,
          subject: "OTODIAL: you're running low on plan allowance",
          html: lowBalanceEmail({
            name,
            minutes: minutesLabel,
            sms: smsLabel,
          }),
          emailType: "usage_warning",
          templateUsed: "lowBalanceEmail",
        },
        "usage_warning"
      );

      if (sent != null) {
        await User.updateOne({ _id: userId }, { $set: { lastUsageWarningEmailAt: new Date() } });
      }
    }

    const peak = Math.max(
      typeof minutesPercent === "number" ? minutesPercent : 0,
      typeof smsPercent === "number" ? smsPercent : 0
    );
    if (peak < UPGRADE_USAGE_THRESHOLD) return;

    const lastUp = user.lastUpgradePlanEmailAt ? new Date(user.lastUpgradePlanEmailAt).getTime() : 0;
    if (Date.now() - lastUp < UPGRADE_PROMPT_COOLDOWN_MS) return;

    const sentUpgrade = await sendEmailSafe(
      {
        to,
        subject: "OTODIAL: time to upgrade your plan",
        html: upgradePlanEmail({ name }),
        emailType: "upgrade_prompt",
        templateUsed: "upgradePlanEmail",
      },
      "upgrade_prompt"
    );

    if (sentUpgrade != null) {
      await User.updateOne({ _id: userId }, { $set: { lastUpgradePlanEmailAt: new Date() } });
    }
  } catch (err) {
    console.error("❌ Usage / upgrade email failed:", err?.message || err);
    if (err?.stack) console.error(err.stack);
  }
}
