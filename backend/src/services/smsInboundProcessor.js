import SMS from "../models/SMS.js";
import { calculateSmsCost, applySmsDeduction } from "./smsBillingService.js";
import { emitSmsCreated } from "../events/smsEvents.js";

/**
 * Dedicated inbound pipeline: persist first, then cost snapshot, then credit deduction + realtime.
 *
 * @param {{
 *   userId: import("mongoose").Types.ObjectId|string|null,
 *   toNumber: string,
 *   fromNumber: string,
 *   messageText: string,
 *   telnyxId?: string|null,
 *   carrier?: string|null,
 * }} payload
 */
export async function processInboundSms(payload) {
  const { userId, toNumber, fromNumber, messageText, telnyxId, carrier } = payload;

  const smsCostRate = Number(process.env.SMS_COST_RATE || 0.0075);
  const smsCost = smsCostRate;

  const sms = await SMS.create({
    user: userId || undefined,
    to: toNumber,
    from: fromNumber,
    body: messageText,
    status: "received",
    direction: "inbound",
    telnyxMessageId: telnyxId || undefined,
    cost: smsCost,
    costPerSms: smsCostRate,
    carrier: carrier || null,
    carrierFees: 0,
  });

  if (userId) {
    emitSmsCreated(userId, sms._id, "inbound");
  }

  const costInfo = calculateSmsCost(messageText);
  await SMS.updateOne(
    { _id: sms._id },
    {
      $set: {
        "smsCostInfo.smsParts": costInfo.smsParts,
        "smsCostInfo.encoding": costInfo.encoding,
        "smsCostInfo.characters": costInfo.characters,
      },
    }
  );

  if (userId) {
    try {
      await applySmsDeduction(userId, sms._id, messageText, {
        direction: "inbound",
        source: "webhook",
      });
    } catch (billErr) {
      console.warn("[smsInboundProcessor] applySmsDeduction:", billErr?.message || billErr);
    }
  }

  return { sms, userId: userId || null };
}
