import mongoose from "mongoose";
import SMS from "../models/SMS.js";
import AdminLog from "../models/AdminLog.js";
import { enqueueOutboundSms } from "./smsQueueService.js";
import { finalizeSmsReservation } from "./smsGuardService.js";
import { emitAdminSocketEvent } from "./adminLiveEventsService.js";

function normalizeId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return id;
}

/**
 * @param {{ userId?: string, search?: string, startDate?: string, endDate?: string, page?: number, limit?: number }} filters
 */
export async function listPendingSmsForApproval(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
  const skip = (page - 1) * limit;

  const query = {
    direction: "outbound",
    moderationStatus: "pending",
  };

  if (filters.userId && mongoose.Types.ObjectId.isValid(String(filters.userId))) {
    query.user = normalizeId(filters.userId);
  }

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }

  const search = String(filters.search || "").trim();
  if (search) {
    query.$or = [
      { to: { $regex: search, $options: "i" } },
      { from: { $regex: search, $options: "i" } },
      { body: { $regex: search, $options: "i" } },
    ];
  }

  const [rows, total] = await Promise.all([
    SMS.find(query)
      .populate("user", "email name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SMS.countDocuments(query),
  ]);

  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * @param {string} smsId
 * @param {import("mongoose").Types.ObjectId|string} adminUserId
 */
export async function approvePendingSms(smsId, adminUserId) {
  const oid = normalizeId(smsId);
  if (!oid) {
    return { ok: false, error: "invalid_id", status: 400 };
  }

  const adminId = normalizeId(adminUserId);

  const updated = await SMS.findOneAndUpdate(
    { _id: oid, moderationStatus: "pending", direction: "outbound" },
    {
      $set: {
        moderationStatus: "approved",
        "moderationMeta.reviewedBy": adminId,
        "moderationMeta.reviewedAt": new Date(),
        "moderationMeta.reason": "",
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return { ok: false, error: "not_found_or_not_pending", status: 404 };
  }

  const reservationKey =
    String(updated.outboundReservationKey || "").trim() ||
    String(updated.sendIdempotencyKey || "").trim();
  if (!reservationKey) {
    return { ok: false, error: "missing_reservation_key", status: 500 };
  }

  enqueueOutboundSms({
    smsDocId: String(updated._id),
    userId: String(updated.user),
    reservationKey,
  });

  await AdminLog.create({
    adminId,
    userId: updated.user,
    action: "SMS_MODERATION_APPROVE",
    payload: { smsId: String(updated._id) },
  }).catch(() => {});

  emitAdminSocketEvent("sms:approved", {
    smsId: String(updated._id),
    userId: String(updated.user),
  });

  return { ok: true, sms: updated };
}

/**
 * @param {string} smsId
 * @param {import("mongoose").Types.ObjectId|string} adminUserId
 * @param {string} [reason]
 */
export async function rejectPendingSms(smsId, adminUserId, reason = "") {
  const oid = normalizeId(smsId);
  if (!oid) {
    return { ok: false, error: "invalid_id", status: 400 };
  }

  const adminId = normalizeId(adminUserId);

  const updated = await SMS.findOneAndUpdate(
    { _id: oid, moderationStatus: "pending", direction: "outbound" },
    {
      $set: {
        moderationStatus: "rejected",
        status: "failed",
        "moderationMeta.reviewedBy": adminId,
        "moderationMeta.reviewedAt": new Date(),
        "moderationMeta.reason": String(reason || "").slice(0, 500),
      },
    },
    { new: true }
  ).lean();

  if (!updated) {
    return { ok: false, error: "not_found_or_not_pending", status: 404 };
  }

  const reservationKey =
    String(updated.outboundReservationKey || "").trim() ||
    String(updated.sendIdempotencyKey || "").trim();
  if (reservationKey) {
    await finalizeSmsReservation(updated.user, reservationKey);
  }

  await AdminLog.create({
    adminId,
    userId: updated.user,
    action: "SMS_MODERATION_REJECT",
    payload: { smsId: String(updated._id), reason: String(reason || "").slice(0, 500) },
  }).catch(() => {});

  emitAdminSocketEvent("sms:rejected", {
    smsId: String(updated._id),
    userId: String(updated.user),
  });

  return { ok: true, sms: updated };
}
