import mongoose from "mongoose";
import SMS from "../models/SMS.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import { getCanonicalUsage } from "./usage/getCanonicalUsage.js";
import { computeSmsCreditsUsed } from "./usageComputationService.js";
import { isUnlimitedSubscription } from "./unlimitedUsageService.js";

/** GSM 03.38 default alphabet (single septet each), excluding extension escape table. */
const GSM_BASIC_CHARS = new Set(
  [
    "\n",
    "\f",
    "\r",
    "Δ",
    "Φ",
    "Γ",
    "Λ",
    "Ω",
    "Π",
    "Ψ",
    "Σ",
    "Θ",
    "Ξ",
    "Æ",
    "æ",
    "ß",
    "É",
    "Å",
    "å",
    "Ø",
    "ø",
    " ",
    "!",
    '"',
    "#",
    "¤",
    "%",
    "&",
    "'",
    "(",
    ")",
    "*",
    "+",
    ",",
    "-",
    ".",
    "/",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    ":",
    ";",
    "<",
    "=",
    ">",
    "?",
    "¡",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "Ä",
    "Ö",
    "Ñ",
    "Ü",
    "§",
    "¿",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "ä",
    "ö",
    "ñ",
    "ü",
    "à",
    "@",
    "£",
    "$",
    "¥",
    "è",
    "é",
    "ù",
    "ì",
    "ò",
    "Ç",
  ].join("")
);

/** GSM extension characters (escape + char = 2 septets). */
const GSM_EXTENDED_TWO_UNITS = new Set(["|", "^", "€", "{", "}", "[", "]", "~", "\\"]);

const billingQueues = new Map();

function runBillingSerialized(userId, fn) {
  const key = String(userId);
  const prev = billingQueues.get(key) || Promise.resolve();
  const next = prev.then(() => fn()).catch((err) => {
    console.error("[smsBilling] serialized task failed:", err?.message || err);
  });
  billingQueues.set(
    key,
    next.finally(() => {
      if (billingQueues.get(key) === next) billingQueues.delete(key);
    })
  );
  return next;
}

/**
 * Strip invisible / bidi / formatting noise before encoding detection (NFKC + directional markers).
 * @param {string} message
 */
export function sanitizeMessage(message) {
  return String(message ?? "")
    .normalize("NFKC")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\uFE00-\uFE0F]/g, "");
}

function isTransactionUnsupportedError(err) {
  const msg = String(err?.message || err || "");
  return (
    /replica set/i.test(msg) ||
    /Transaction numbers/i.test(msg) ||
    /multi-document transactions/i.test(msg)
  );
}

/**
 * @param {string} message
 * @returns {"GSM" | "UNICODE"}
 */
export function detectEncoding(message) {
  const clean = sanitizeMessage(message);
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (GSM_BASIC_CHARS.has(ch) || GSM_EXTENDED_TWO_UNITS.has(ch)) continue;
    return "UNICODE";
  }
  return "GSM";
}

function gsmCodeUnits(message) {
  let units = 0;
  for (let i = 0; i < message.length; i++) {
    const ch = message[i];
    if (GSM_EXTENDED_TWO_UNITS.has(ch)) units += 2;
    else if (GSM_BASIC_CHARS.has(ch)) units += 1;
    else throw new Error("not_gsm");
  }
  return units;
}

/**
 * @param {string} message
 * @returns {number} segment count (>= 1)
 */
export function calculateSmsParts(message) {
  const safe = sanitizeMessage(String(message ?? ""));
  if (!safe) return 1;
  try {
    if (detectEncoding(safe) === "UNICODE") {
      const len = safe.length;
      if (len <= 70) return 1;
      return Math.ceil(len / 67);
    }
    const units = gsmCodeUnits(safe);
    if (units <= 160) return 1;
    return Math.ceil(units / 153);
  } catch {
    return 1;
  }
}

/**
 * @param {string} message
 * @returns {{ smsParts: number, encoding: "GSM" | "UNICODE", characters: number }}
 */
export function calculateSmsCost(message) {
  const text = sanitizeMessage(String(message ?? ""));
  const encoding = detectEncoding(text);
  const characters = text.length;
  const smsParts = calculateSmsParts(text);
  return { smsParts, encoding, characters };
}

function normalizeUserId(userId) {
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  if (typeof userId === "string" && mongoose.Types.ObjectId.isValid(userId)) {
    return new mongoose.Types.ObjectId(userId);
  }
  return userId;
}

/**
 * Apply SMS credit info after the message row exists (outbound after Telnyx, inbound after webhook save).
 * Uses a Mongo session + transaction when supported so usage reads and writes are consistent.
 * Mirrors billed units on User.smsUsed (existing field) when increment succeeds.
 *
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {import("mongoose").Types.ObjectId|string} messageId — Mongo SMS _id
 * @param {string} message — original body used for segmentation
 * @param {{ direction?: "inbound" | "outbound", source?: string, finalizeReservationKey?: string }} [options]
 */
export async function applySmsDeduction(userId, messageId, message, options = {}) {
  if (!userId || !messageId) return;

  const direction = options.direction === "inbound" ? "inbound" : "outbound";

  const oid =
    messageId instanceof mongoose.Types.ObjectId
      ? messageId
      : new mongoose.Types.ObjectId(String(messageId));
  const uid = normalizeUserId(userId);

  return runBillingSerialized(uid, async () => {
    const finalizeReservationIfNeeded = async () => {
      if (!options.finalizeReservationKey) return;
      try {
        const { finalizeSmsReservation } = await import("./smsGuardService.js");
        await finalizeSmsReservation(uid, options.finalizeReservationKey);
      } catch (frErr) {
        console.warn("[smsBilling] finalizeReservation failed:", frErr?.message || frErr);
      }
    };

    const existing = await SMS.findOne({ _id: oid, user: uid })
      .select("smsCostInfo direction")
      .lean();
    if (typeof existing?.smsCostInfo?.costDeducted === "number") {
      await finalizeReservationIfNeeded();
      console.log("[SMS BILLING]", {
        direction,
        smsParts: existing?.smsCostInfo?.smsParts ?? null,
        costDeducted: existing.smsCostInfo.costDeducted,
        userId: String(uid),
        messageId: String(oid),
        source: options.source ?? undefined,
        skipped: true,
        reason: "already_deducted",
      });
      return;
    }

    if (existing?.direction && existing.direction !== direction) {
      if (options.finalizeReservationKey) {
        try {
          const { releaseSmsReservation } = await import("./smsGuardService.js");
          await releaseSmsReservation(uid, options.finalizeReservationKey);
        } catch {
          /* ignore */
        }
      }
      console.log("[SMS BILLING]", {
        direction,
        smsParts: null,
        costDeducted: null,
        userId: String(uid),
        messageId: String(oid),
        source: options.source ?? undefined,
        skipped: true,
        reason: "direction_mismatch",
        documentDirection: existing.direction,
      });
      return;
    }

    let precomputed = null;
    try {
      precomputed = calculateSmsCost(message);
    } catch (e) {
      console.error("[smsBilling] calculateSmsCost failed:", e?.message || e);
      precomputed = { smsParts: 1, encoding: "GSM", characters: String(message ?? "").length };
    }

    const { smsParts: rawParts, encoding: enc0, characters: chars0 } = precomputed;
    const smsParts = Math.max(1, Number(rawParts) || 1);
    const encoding = enc0 === "UNICODE" ? "UNICODE" : "GSM";
    const characters = Number.isFinite(chars0) ? chars0 : sanitizeMessage(String(message ?? "")).length;

    if (smsParts > 10) {
      console.warn("[smsBilling] High SMS segmentation detected", {
        userId: String(uid),
        messageId: String(oid),
        smsParts,
      });
    }

    /** Set when billing row is updated (success path or fallback). */
    let billingSnapshot = null;

    const finalizeAfterSuccess = async () => {
      if (!billingSnapshot) return;
      const { actualParts, billedParts } = billingSnapshot;
      console.log("[SMS BILLING]", {
        direction,
        smsParts: actualParts,
        costDeducted: billedParts,
        userId: String(uid),
        messageId: String(oid),
        source: options.source ?? undefined,
      });
      try {
        const { emitSmsUsageUpdated, emitSmsUpdated } = await import("../events/smsEvents.js");
        await emitSmsUsageUpdated(uid, oid);
        emitSmsUpdated(uid, oid, direction);
      } catch (emitErr) {
        console.warn("[smsBilling] post-deduction emit failed:", emitErr?.message || emitErr);
      }
      await finalizeReservationIfNeeded();
    };

    const runCore = async (session) => {
      const subscription = await Subscription.findOne({ userId: uid }).sort({ createdAt: -1 }).lean();
      const unlimited = subscription && isUnlimitedSubscription(subscription);

      /** Actual segmentation count (Telnyx-style). */
      const actualParts = smsParts;
      /** Charged units for quota (future: promos / pricing); today equals capped actual. */
      let billedParts = actualParts;

      if (!unlimited) {
        const canonical = await getCanonicalUsage(uid, subscription);
        const smsLimit = Math.max(0, Number(canonical?.smsLimit ?? 0));
        const used = await computeSmsCreditsUsed(uid, { excludeSmsIds: [oid], session });
        const remaining = Math.max(0, smsLimit - used);
        billedParts = Math.min(actualParts, remaining);
      }

      billingSnapshot = { actualParts, billedParts };

      await SMS.updateOne(
        { _id: oid, user: uid, direction },
        {
          $set: {
            "smsCostInfo.smsParts": actualParts,
            "smsCostInfo.encoding": encoding,
            "smsCostInfo.characters": characters,
            "smsCostInfo.costDeducted": billedParts,
          },
        },
        session ? { session } : {}
      );

      try {
        await User.updateOne(
          { _id: uid },
          { $inc: { smsUsed: billedParts } },
          session ? { session } : {}
        );
      } catch (userErr) {
        console.warn("[smsBilling] User.smsUsed increment skipped (non-fatal):", userErr?.message || userErr);
      }
    };

    const persistBillingFallback = async (causeErr) => {
      console.error("SMS billing failed", causeErr);
      const smsPartsFbNum = Math.max(
        1,
        Number(precomputed?.smsParts ?? calculateSmsParts(message)) || 1
      );
      const encFb = precomputed?.encoding === "UNICODE" ? "UNICODE" : "GSM";
      const charsFb =
        Number.isFinite(precomputed?.characters) && precomputed.characters >= 0
          ? precomputed.characters
          : sanitizeMessage(String(message ?? "")).length;

      console.warn("[smsBilling] SMS billing fallback triggered", {
        userId: String(uid),
        messageId: String(oid),
        messageLength: String(message ?? "").length,
        smsParts: smsPartsFbNum,
        costDeducted: smsPartsFbNum,
      });

      try {
        await SMS.updateOne(
          { _id: oid, user: uid, direction },
          {
            $set: {
              "smsCostInfo.smsParts": smsPartsFbNum,
              "smsCostInfo.encoding": encFb,
              "smsCostInfo.characters": charsFb,
              "smsCostInfo.costDeducted": smsPartsFbNum,
            },
          }
        );
        billingSnapshot = { actualParts: smsPartsFbNum, billedParts: smsPartsFbNum };
        try {
          await User.updateOne({ _id: uid }, { $inc: { smsUsed: smsPartsFbNum } });
        } catch (userErr) {
          console.warn(
            "[smsBilling] User.smsUsed fallback increment skipped:",
            userErr?.message || userErr
          );
        }
      } catch (fallbackErr) {
        console.error(
          "[smsBilling] fallback smsCostInfo persist failed:",
          fallbackErr?.message || fallbackErr
        );
      }
    };

    let session = null;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        await runCore(session);
      });
    } catch (err) {
      if (session && isTransactionUnsupportedError(err)) {
        console.warn(
          "[smsBilling] Mongo transactions unavailable; applying billing without transaction:",
          err?.message || err
        );
      }
      try {
        await runCore(null);
      } catch (inner) {
        await persistBillingFallback(inner);
      }
    } finally {
      if (session) {
        try {
          session.endSession();
        } catch {
          /* ignore */
        }
      }
    }

    try {
      await finalizeAfterSuccess();
    } catch (finErr) {
      console.warn("[smsBilling] finalizeAfterSuccess failed:", finErr?.message || finErr);
    }
  });
}
