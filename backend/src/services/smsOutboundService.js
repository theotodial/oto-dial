import { getTelnyx } from "../../config/telnyx.js";
import SMS from "../models/SMS.js";
import PhoneNumber from "../models/PhoneNumber.js";
import User from "../models/User.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  isUnlimitedSubscription,
} from "./unlimitedUsageService.js";
import { emitAdminLiveSms } from "./adminLiveEventsService.js";
import { evaluateFraudEvent } from "./fraudDetectionService.js";
import { enforceTelecomPolicy } from "./telecomPolicyService.js";
import { enforceUsageRateLimit } from "./usageRateLimitService.js";
import { getCachedUserSubscription } from "./subscriptionService.js";
import { normalizeSmsDestination, isLikelyShortCode } from "../utils/phoneNormalize.js";
import { isOptedOut } from "./optOutService.js";
import { isSameCountryOutboundOnlyEnabled } from "../utils/telecomCountryLock.js";
import { extractTelnyxSdkError } from "../utils/telnyxErrorMessage.js";

const SMS_OPT_OUT_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "HELP",
  "START",
  "UNSTOP",
]);

/** True for standard +E.164 long codes (not short codes, not alphanumeric sender IDs). */
function isE164NumericLongCode(value) {
  const s = String(value || "").trim();
  return /^\+\d{10,15}$/.test(s);
}

export { normalizeSmsDestination } from "../utils/phoneNormalize.js";

/**
 * @returns {{ ok: true, messageId: string } | { ok: false, error: string, status?: number, retryable?: boolean, countryLocked?: boolean, sourceCountry?: string, retryAfterMs?: number }}
 */
export async function sendOutboundSms({ userId, to, text, campaignId = null }) {
  try {
    const telnyx = getTelnyx();
    if (!telnyx) {
      return { ok: false, error: "Telnyx not configured", status: 503, retryable: true };
    }

    if (!to || !text) {
      return { ok: false, error: "Missing to or text", status: 400, retryable: false };
    }

    const normalizedText = String(text || "").trim().toUpperCase();
    const toFormatted = normalizeSmsDestination(to);
    if (!toFormatted) {
      return { ok: false, error: "Invalid destination number", status: 400, retryable: false };
    }

    if (await isOptedOut(userId, toFormatted)) {
      return {
        ok: false,
        error: "Recipient has opted out",
        status: 403,
        retryable: false,
        optedOut: true,
      };
    }

    const policyCheck = await enforceTelecomPolicy({
      userId,
      channel: "sms",
      destinationNumber: toFormatted,
    });
    if (!policyCheck.allowed) {
      return { ok: false, error: policyCheck.error, status: 403, retryable: false };
    }

    const rateLimit = enforceUsageRateLimit({ userId, channel: "sms" });
    if (!rateLimit.allowed) {
      return {
        ok: false,
        error: "SMS rate limit exceeded. Please wait before sending more messages.",
        status: 429,
        retryAfterMs: rateLimit.retryAfterMs,
        retryable: true,
      };
    }

    const fraudCheck = await evaluateFraudEvent({
      userId,
      channel: "sms",
      destinationNumber: toFormatted,
    });
    if (!fraudCheck.allowed && fraudCheck.blocked) {
      return {
        ok: false,
        error: fraudCheck.reason || "SMS blocked by fraud protection.",
        status: 403,
        retryable: false,
      };
    }

    const subscription = (await getCachedUserSubscription(userId)) || null;
    if (!subscription || !(subscription.id || subscription._id)) {
      return { ok: false, error: "No subscription found", status: 403, retryable: false };
    }

    const subId = subscription.id || subscription._id;

    const unlimitedGate = await checkUnlimitedUsageBeforeAction({
      subscriptionId: subId,
      userId,
      channel: "sms_outbound",
      smsIncrement: 1,
    });

    if (!unlimitedGate.allowed) {
      return {
        ok: false,
        error: createSuspiciousActivityErrorPayload().error,
        status: 403,
        retryable: false,
      };
    }

    const unlimitedPlan = isUnlimitedSubscription(
      unlimitedGate.subscription || subscription
    );

    if (!unlimitedPlan && !(Number(subscription.smsLimit) > 0)) {
      return {
        ok: false,
        error: "SMS is not included in your current plan.",
        status: 403,
        retryable: false,
      };
    }

    if (!unlimitedPlan && subscription.smsRemaining <= 0) {
      return {
        ok: false,
        error:
          "No SMS remaining. Please upgrade your plan or wait for your next billing cycle.",
        status: 403,
        retryable: false,
      };
    }

    const phone = await PhoneNumber.findOne({
      userId,
      status: "active",
    });

    const skipCountryLockForShortCode =
      isLikelyShortCode(toFormatted) && SMS_OPT_OUT_KEYWORDS.has(normalizedText);

    if (
      isSameCountryOutboundOnlyEnabled() &&
      phone &&
      phone.lockedCountry !== false &&
      phone.countryCode &&
      !skipCountryLockForShortCode
    ) {
      const { validateCountryLock } = await import("../utils/countryUtils.js");
      const validation = validateCountryLock(phone.countryCode, toFormatted);

      if (!validation.valid) {
        return {
          ok: false,
          error: validation.error,
          status: 403,
          countryLocked: true,
          sourceCountry: phone.countryCode,
          retryable: false,
        };
      }
    }

    if (!phone) {
      return { ok: false, error: "No phone number assigned", status: 400, retryable: false };
    }

    const envProfileId = String(process.env.TELNYX_MESSAGING_PROFILE_ID || "").trim();
    let messagingProfileId = String(phone.messagingProfileId || "").trim();
    if (!messagingProfileId) {
      const userDoc = await User.findById(userId).select("messagingProfileId").lean();
      messagingProfileId = String(userDoc?.messagingProfileId || "").trim();
    }
    if (!messagingProfileId && envProfileId) {
      messagingProfileId = envProfileId;
    }
    if (!messagingProfileId) {
      return {
        ok: false,
        error: "Messaging profile not configured for this number",
        status: 400,
        retryable: false,
      };
    }

    const format = (n) => (n.startsWith("+") ? n : `+${n}`);
    const from = format(phone.phoneNumber);

    // `messages.send` + messaging_profile_id can apply the profile's default alphanumeric sender
    // (e.g. "OTODIAL") for some destinations; many countries (PK, etc.) require that sender to be
    // pre-registered. Long-code endpoint sends from the owned number explicitly.
    const preferLongCode =
      String(process.env.SMS_USE_TELNYX_LONG_CODE_ENDPOINT || "true")
        .trim()
        .toLowerCase() !== "false";

    // Long-code API expects E.164 peers; short-code destinations (STOP, HELP, etc.) need generic send.
    const shortCodeDestination = isLikelyShortCode(toFormatted);
    const response =
      !shortCodeDestination && preferLongCode && isE164NumericLongCode(from)
        ? await telnyx.messages.sendLongCode({
            from,
            to: toFormatted,
            text,
            use_profile_webhooks: true,
          })
        : await telnyx.messages.send({
            messaging_profile_id: messagingProfileId,
            from,
            to: toFormatted,
            text,
          });

    const sent = response?.data ?? response;
    const messageId = sent?.id;
    if (!messageId) {
      console.error(
        "[SMS] Telnyx send returned no message id. Response keys:",
        response && typeof response === "object" ? Object.keys(response) : response
      );
      return {
        ok: false,
        error:
          "SMS provider returned an unexpected response (no message id). Check server logs and Telnyx messaging profile.",
        status: 502,
        retryable: true,
      };
    }

    const smsCostRate = Number(process.env.SMS_COST_RATE || 0.0075);
    const smsCost = smsCostRate;

    await SMS.create({
      user: userId,
      from,
      to: toFormatted,
      body: text,
      status: "sent",
      direction: "outbound",
      telnyxMessageId: messageId,
      cost: smsCost,
      costPerSms: smsCostRate,
      carrier: sent?.carrier || null,
      carrierFees: 0,
      ...(campaignId ? { campaign: campaignId } : {}),
    });

    emitAdminLiveSms({
      eventType: "sent",
      userId,
      messageId,
      destination: toFormatted,
      from,
      status: "sent",
      bodyPreview: text,
    }).catch((error) => {
      console.warn("[ADMIN LIVE] failed to emit sms:", error?.message || error);
    });

    return { ok: true, messageId };
  } catch (err) {
    const { userMessage, httpStatus, telnyxCode } = extractTelnyxSdkError(err);
    console.error("SMS FAILED:", {
      status: err?.status ?? err?.response?.status,
      telnyxCode,
      message: userMessage,
      raw: err?.error ?? err?.response?.data,
    });

    let errorMessage = userMessage || "Failed to send SMS";
    let retryable = httpStatus >= 500 || httpStatus === 429 || !httpStatus;

    if (telnyxCode === "40021" || String(telnyxCode) === "40021") {
      errorMessage =
        "Cannot send SMS to this number - it appears to be a landline or VoIP number, not a mobile phone.";
      retryable = false;
    } else if (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429) {
      retryable = false;
    }

    return { ok: false, error: errorMessage, status: httpStatus || 500, retryable };
  }
}
