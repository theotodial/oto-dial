import { randomUUID } from "crypto";
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
import { applySmsDeduction } from "./smsBillingService.js";
import {
  calculateSmsParts,
  reserveSmsCredits,
  checkUserVelocity,
  releaseSmsReservation,
  SmsGuardError,
} from "./smsGuardService.js";
import { enqueueOutboundSms } from "./smsQueueService.js";
import { emitAdminSocketEvent } from "./adminLiveEventsService.js";

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
 * Telnyx API invocation only — parameters and branches match historical send behavior.
 * @returns {Promise<{ response: unknown }>}
 */
async function invokeTelnyxMessagesSend(telnyx, { from, toFormatted, text, messagingProfileId, preferLongCode, shortCodeDestination }) {
  let response;
  response =
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
  return response;
}

/**
 * @typedef {{ smsDocId: string, userId: string, reservationKey: string }} SmsOutboundQueueJob
 */

/**
 * Worker: completes Telnyx send + billing for a queued SMS row.
 * @param {SmsOutboundQueueJob} job
 */
export async function processOutboundQueueJob(job) {
  const { smsDocId, userId, reservationKey } = job;

  const smsDoc = await SMS.findOne({
    _id: smsDocId,
    user: userId,
    direction: "outbound",
  });
  if (!smsDoc) {
    await releaseSmsReservation(userId, reservationKey);
    return;
  }

  const userLite = await User.findById(userId).select("mode").lean();
  console.log("[MODE CHECK]", userLite?.mode ?? null);

  if (smsDoc.moderationStatus === "pending") {
    console.log("[SMS QUEUE] skip: moderation pending", { smsDocId, userId });
    return;
  }
  if (smsDoc.status !== "queued") {
    return;
  }

  const telnyx = getTelnyx();
  if (!telnyx) {
    console.error("[SMS QUEUE] Telnyx client missing in worker", { smsDocId, userId });
    await SMS.updateOne({ _id: smsDoc._id }, { $set: { status: "failed" } }).catch(() => {});
    await releaseSmsReservation(userId, reservationKey);
    try {
      const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
      emitSmsOutboundLifecycle(userId, "failed", {
        mongoId: String(smsDoc._id),
        to: smsDoc.to,
        error: "Telnyx unavailable",
      });
    } catch {
      /* ignore */
    }
    return;
  }

  const toFormatted = smsDoc.to;
  const text = smsDoc.body;
  const from = smsDoc.from;
  console.log("[FROM NUMBER]", from);

  const phone = await PhoneNumber.findOne({ userId, status: "active" });
  const envProfileId = String(process.env.TELNYX_MESSAGING_PROFILE_ID || "").trim();
  let messagingProfileId = String(phone?.messagingProfileId || "").trim();
  if (!messagingProfileId) {
    const userDoc = await User.findById(userId).select("messagingProfileId").lean();
    messagingProfileId = String(userDoc?.messagingProfileId || "").trim();
  }
  if (!messagingProfileId && envProfileId) {
    messagingProfileId = envProfileId;
  }
  if (!messagingProfileId) {
    await SMS.updateOne({ _id: smsDoc._id }, { $set: { status: "failed" } }).catch(() => {});
    await releaseSmsReservation(userId, reservationKey);
    try {
      const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
      emitSmsOutboundLifecycle(userId, "failed", {
        mongoId: String(smsDoc._id),
        to: toFormatted,
        error: "Messaging profile not configured",
      });
    } catch {
      /* ignore */
    }
    return;
  }

  const preferLongCode =
    String(process.env.SMS_USE_TELNYX_LONG_CODE_ENDPOINT || "true").trim().toLowerCase() !== "false";
  const shortCodeDestination = isLikelyShortCode(toFormatted);

  let response;
  try {
    console.log("[TELNYX SEND ATTEMPT]", {
      from,
      to: toFormatted,
      messagingProfileId,
      preferLongCode,
      shortCodeDestination,
      textLen: String(text || "").length,
    });
    response = await invokeTelnyxMessagesSend(telnyx, {
      from,
      toFormatted,
      text,
      messagingProfileId,
      preferLongCode,
      shortCodeDestination,
    });
    const sentPreview = response?.data ?? response;
    console.log("[TELNYX RESPONSE]", {
      id: sentPreview?.id,
      carrier: sentPreview?.carrier,
    });
  } catch (telnyxErr) {
    console.error("[TELNYX ERROR]", telnyxErr);
    await SMS.updateOne({ _id: smsDoc._id }, { $set: { status: "failed" } }).catch(() => {});
    await releaseSmsReservation(userId, reservationKey);
    const { userMessage } = extractTelnyxSdkError(telnyxErr);
    try {
      const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
      emitSmsOutboundLifecycle(userId, "failed", {
        mongoId: String(smsDoc._id),
        to: toFormatted,
        error: userMessage || "Failed to send SMS",
      });
    } catch {
      /* ignore */
    }
    console.error("[SMS] queue Telnyx error:", userMessage || telnyxErr);
    return;
  }

  const sent = response?.data ?? response;
  const messageId = sent?.id;
  if (!messageId) {
    await SMS.updateOne({ _id: smsDoc._id }, { $set: { status: "failed" } }).catch(() => {});
    await releaseSmsReservation(userId, reservationKey);
    try {
      const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
      emitSmsOutboundLifecycle(userId, "failed", {
        mongoId: String(smsDoc._id),
        to: toFormatted,
        error: "SMS provider returned no message id",
      });
    } catch {
      /* ignore */
    }
    return;
  }

  await SMS.updateOne(
    { _id: smsDoc._id },
    {
      $set: {
        status: "sent",
        telnyxMessageId: messageId,
        carrier: sent?.carrier || null,
      },
    }
  );

  try {
    const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
    emitSmsOutboundLifecycle(userId, "sent", {
      mongoId: String(smsDoc._id),
      to: toFormatted,
      messageId: String(messageId),
    });
  } catch {
    /* ignore */
  }

  try {
    await applySmsDeduction(userId, smsDoc._id, text, {
      direction: "outbound",
      source: "outbound_send",
      finalizeReservationKey: reservationKey,
    });
  } catch (deductErr) {
    await releaseSmsReservation(userId, reservationKey);
    console.error("[SMS] applySmsDeduction after send failed:", deductErr?.message || deductErr);
    try {
      const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
      emitSmsOutboundLifecycle(userId, "failed", {
        mongoId: String(smsDoc._id),
        to: toFormatted,
        error: deductErr?.message || "Billing failed after send",
      });
    } catch {
      /* ignore */
    }
  }

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
}

/**
 * @returns {{ ok: true, messageId?: string, mongoId?: string, queued?: boolean, status?: string, idempotent?: boolean } | { ok: false, error: string, status?: number, retryable?: boolean, countryLocked?: boolean, sourceCountry?: string, retryAfterMs?: number }}
 */
export async function sendOutboundSms({ userId, to, text, campaignId = null, idempotencyKey = null }) {
  let reservationKeyForRelease = null;

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

    const unlimitedPlan = isUnlimitedSubscription(unlimitedGate.subscription || subscription);

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

    const clientKey =
      idempotencyKey != null && String(idempotencyKey).trim() !== ""
        ? String(idempotencyKey).trim().slice(0, 128)
        : null;

    const reservationKey = clientKey || `gen:${randomUUID()}`;
    reservationKeyForRelease = reservationKey;

    if (clientKey) {
      const existing = await SMS.findOne({
        user: userId,
        sendIdempotencyKey: clientKey,
        direction: "outbound",
      })
        .sort({ createdAt: -1 })
        .lean();

      if (existing?.status === "sent" && existing.telnyxMessageId) {
        reservationKeyForRelease = null;
        return {
          ok: true,
          messageId: existing.telnyxMessageId,
          mongoId: String(existing._id),
          idempotent: true,
        };
      }

      if (existing?.status === "queued") {
        if (existing.moderationStatus === "pending") {
          reservationKeyForRelease = null;
          return {
            ok: true,
            mongoId: String(existing._id),
            queued: true,
            status: "queued",
            moderationPending: true,
          };
        }
        const t0 = existing.updatedAt ? new Date(existing.updatedAt) : new Date(existing.createdAt);
        if (Date.now() - t0.getTime() < 120000) {
          reservationKeyForRelease = null;
          return {
            ok: false,
            error: "This message is still being sent. Please wait a moment.",
            status: 409,
            retryable: true,
            mongoId: String(existing._id),
          };
        }
        await SMS.deleteOne({ _id: existing._id });
      } else if (existing?.status === "failed") {
        if (existing.moderationStatus === "rejected") {
          reservationKeyForRelease = null;
          return {
            ok: true,
            mongoId: String(existing._id),
            status: "failed",
            userFacingStatus: "failed",
          };
        }
        await SMS.deleteOne({ _id: existing._id });
      }
    }

    const smsParts = calculateSmsParts(text);

    let reserveResult;
    try {
      reserveResult = await reserveSmsCredits(userId, smsParts, reservationKey);
    } catch (guardErr) {
      reservationKeyForRelease = null;
      if (guardErr instanceof SmsGuardError && guardErr.code === "INSUFFICIENT_SMS_CREDITS") {
        console.warn("[smsGuard] blocked send (credits)", { userId: String(userId), smsParts });
        return { ok: false, error: guardErr.message, status: 403, retryable: false };
      }
      throw guardErr;
    }

    if (reserveResult?.alreadyFinalized) {
      reservationKeyForRelease = null;
      if (clientKey) {
        const dupFinal = await SMS.findOne({
          user: userId,
          sendIdempotencyKey: clientKey,
          direction: "outbound",
        })
          .sort({ createdAt: -1 })
          .lean();
        if (dupFinal?.status === "sent" && dupFinal.telnyxMessageId) {
          return {
            ok: true,
            messageId: dupFinal.telnyxMessageId,
            mongoId: String(dupFinal._id),
            idempotent: true,
          };
        }
      }
      return {
        ok: false,
        error: "This message was already processed.",
        status: 409,
        retryable: false,
      };
    }

    try {
      await checkUserVelocity(userId);
    } catch (guardErr) {
      await releaseSmsReservation(userId, reservationKey);
      reservationKeyForRelease = null;
      if (guardErr instanceof SmsGuardError && guardErr.code === "RATE_LIMIT_EXCEEDED") {
        return { ok: false, error: guardErr.message, status: 429, retryable: true };
      }
      throw guardErr;
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
        await releaseSmsReservation(userId, reservationKey);
        reservationKeyForRelease = null;
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
      await releaseSmsReservation(userId, reservationKey);
      reservationKeyForRelease = null;
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
      await releaseSmsReservation(userId, reservationKey);
      reservationKeyForRelease = null;
      return {
        ok: false,
        error: "Messaging profile not configured for this number",
        status: 400,
        retryable: false,
      };
    }

    const format = (n) => (n.startsWith("+") ? n : `+${n}`);
    const from = format(phone.phoneNumber);

    const smsCostRate = Number(process.env.SMS_COST_RATE || 0.0075);
    const smsCost = smsCostRate;

    const moderationUser = await User.findById(userId)
      .select("smsApprovalFlag smsApprovalWarmupRemaining mode")
      .lean();
    console.log("[MODE CHECK]", moderationUser?.mode ?? null);

    let bypassSmsModeration = false;
    if (moderationUser?.smsApprovalFlag === true) {
      const warmupLeft = Math.max(0, Number(moderationUser.smsApprovalWarmupRemaining ?? 0));
      if (warmupLeft > 0) {
        const warmed = await User.findOneAndUpdate(
          {
            _id: userId,
            smsApprovalFlag: true,
            smsApprovalWarmupRemaining: { $gte: 1 },
          },
          { $inc: { smsApprovalWarmupRemaining: -1 } },
          { new: true }
        )
          .select("smsApprovalWarmupRemaining")
          .lean();
        if (warmed) {
          bypassSmsModeration = true;
        }
      }
    }

    const needsModerationApproval =
      moderationUser?.smsApprovalFlag === true && !bypassSmsModeration;

    let smsDoc = null;
    try {
      smsDoc = await SMS.create({
        user: userId,
        from,
        to: toFormatted,
        body: text,
        status: "queued",
        direction: "outbound",
        cost: smsCost,
        costPerSms: smsCostRate,
        carrier: null,
        carrierFees: 0,
        ...(campaignId ? { campaign: campaignId } : {}),
        ...(clientKey ? { sendIdempotencyKey: clientKey } : {}),
        outboundReservationKey: reservationKey,
        moderationStatus: needsModerationApproval ? "pending" : "none",
      });
    } catch (createErr) {
      await releaseSmsReservation(userId, reservationKey);
      reservationKeyForRelease = null;
      if (createErr?.code === 11000 && clientKey) {
        const dup = await SMS.findOne({
          user: userId,
          sendIdempotencyKey: clientKey,
          direction: "outbound",
        }).lean();
        if (dup?.status === "sent" && dup.telnyxMessageId) {
          return {
            ok: true,
            messageId: dup.telnyxMessageId,
            mongoId: String(dup._id),
            idempotent: true,
          };
        }
        if (dup?.moderationStatus === "pending") {
          return {
            ok: true,
            mongoId: String(dup._id),
            queued: true,
            status: "queued",
            moderationPending: true,
          };
        }
      }
      throw createErr;
    }

    reservationKeyForRelease = null;

    if (needsModerationApproval) {
      try {
        const { emitSmsCreated } = await import("../events/smsEvents.js");
        emitSmsCreated(userId, smsDoc._id, "outbound");
      } catch (emitErr) {
        console.warn("[SMS] emitSmsCreated skipped:", emitErr?.message || emitErr);
      }

      try {
        const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
        emitSmsOutboundLifecycle(userId, "queued", {
          mongoId: String(smsDoc._id),
          to: toFormatted,
        });
      } catch (emitErr) {
        console.warn("[SMS] emit moderation queued skipped:", emitErr?.message || emitErr);
      }

      emitAdminSocketEvent("sms:queued_for_approval", {
        smsId: String(smsDoc._id),
        userId: String(userId),
        to: toFormatted,
        from,
        bodyPreview: String(text || "").slice(0, 160),
      });

      return {
        ok: true,
        mongoId: String(smsDoc._id),
        queued: true,
        status: "queued",
        moderationPending: true,
      };
    }

    try {
      const { emitSmsCreated } = await import("../events/smsEvents.js");
      emitSmsCreated(userId, smsDoc._id, "outbound");
    } catch (emitErr) {
      console.warn("[SMS] emitSmsCreated skipped:", emitErr?.message || emitErr);
    }

    try {
      const { emitSmsOutboundLifecycle } = await import("../events/smsEvents.js");
      emitSmsOutboundLifecycle(userId, "queued", {
        mongoId: String(smsDoc._id),
        to: toFormatted,
      });
    } catch (emitErr) {
      console.warn("[SMS] emit queued skipped:", emitErr?.message || emitErr);
    }

    console.log("[QUEUE PUSH]", {
      to: toFormatted,
      message: String(text || "").slice(0, 200),
      smsDocId: String(smsDoc._id),
    });
    enqueueOutboundSms({
      smsDocId: String(smsDoc._id),
      userId: String(userId),
      reservationKey,
    });

    return {
      ok: true,
      queued: true,
      mongoId: String(smsDoc._id),
      status: "queued",
    };
  } catch (err) {
    if (reservationKeyForRelease) {
      await releaseSmsReservation(userId, reservationKeyForRelease).catch(() => {});
    }

    if (err instanceof SmsGuardError) {
      if (err.code === "INSUFFICIENT_SMS_CREDITS") {
        return { ok: false, error: err.message, status: 403, retryable: false };
      }
      if (err.code === "RATE_LIMIT_EXCEEDED") {
        return { ok: false, error: err.message, status: 429, retryable: true };
      }
    }

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
