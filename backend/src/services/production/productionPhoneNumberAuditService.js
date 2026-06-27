/**
 * RC2 Priority 3 — purchased number ownership audit.
 * Cross-references Mongo PhoneNumber ↔ User ↔ Subscription ↔ Telnyx ↔ recent activity.
 * Never auto-assigns uncertain numbers — manual review queue only.
 */

import PhoneNumber from "../../models/PhoneNumber.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import { getTelnyx } from "../../../config/telnyx.js";

async function fetchTelnyxInventory() {
  const telnyx = getTelnyx();
  if (!telnyx?.phoneNumbers?.list) return { available: false, numbers: new Map() };

  const byPhone = new Map();
  try {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 20) {
      const res = await telnyx.phoneNumbers.list({ page: { number: page, size: 100 } });
      for (const row of res.data || []) {
        if (row.phone_number) byPhone.set(row.phone_number, row);
      }
      hasMore = (res.data || []).length >= 100;
      page += 1;
    }
    return { available: true, numbers: byPhone };
  } catch (err) {
    return { available: false, error: err?.message || String(err), numbers: byPhone };
  }
}

export async function auditPhoneNumberOwnership(options = {}) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const telnyx = await fetchTelnyxInventory();

  const mongoNumbers = await PhoneNumber.find({}).lean();
  const assigned = mongoNumbers.filter((n) => n.userId && n.status === "active");
  const orphans = mongoNumbers.filter((n) => !n.userId && n.status === "active");
  const inactiveAssigned = mongoNumbers.filter((n) => n.userId && (!n.isActive || n.status !== "active"));

  const dupAgg = await PhoneNumber.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: "$phoneNumber", count: { $sum: 1 }, ids: { $push: "$_id" }, users: { $addToSet: "$userId" } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  const manualReview = [];
  const recovered = [];

  for (const num of assigned) {
    const user = await User.findById(num.userId).select("_id email stripeCustomerId").lean();
    const sub = user
      ? await Subscription.findOne({ userId: user._id }).sort({ createdAt: -1 }).select("status planName").lean()
      : null;

    const recentCall = await Call.findOne({
      user: num.userId,
      $or: [{ fromNumber: num.phoneNumber }, { toNumber: num.phoneNumber }],
      createdAt: { $gte: since },
    })
      .select("_id createdAt")
      .lean();

    const recentSms = await SMS.findOne({
      user: num.userId,
      $or: [{ from: num.phoneNumber }, { to: num.phoneNumber }],
      createdAt: { $gte: since },
    })
      .select("_id createdAt")
      .lean();

    const telnyxRow = telnyx.numbers.get(num.phoneNumber) || null;
    const issues = [];

    if (!user) issues.push("owner_user_missing");
    if (!sub) issues.push("no_subscription");
    if (telnyx.available && !telnyxRow) issues.push("missing_from_telnyx_inventory");
    if (!num.telnyxPhoneNumberId) issues.push("missing_telnyx_id");

    if (issues.length) {
      manualReview.push({
        phoneNumber: num.phoneNumber,
        phoneNumberId: String(num._id),
        userId: num.userId ? String(num.userId) : null,
        email: user?.email || null,
        stripeCustomerId: user?.stripeCustomerId || null,
        subscriptionStatus: sub?.status || null,
        telnyxPhoneNumberId: num.telnyxPhoneNumberId || telnyxRow?.id || null,
        recentCallId: recentCall?._id ? String(recentCall._id) : null,
        recentSmsId: recentSms?._id ? String(recentSms._id) : null,
        issues,
        evidence: { mongo: true, telnyx: Boolean(telnyxRow), recentActivity: Boolean(recentCall || recentSms) },
      });
    }
  }

  for (const dup of dupAgg) {
    manualReview.push({
      phoneNumber: dup._id,
      type: "duplicate",
      count: dup.count,
      ids: dup.ids.map(String),
      userIds: (dup.users || []).map(String),
      issues: ["duplicate_active_assignment"],
      evidence: { mongo: true },
    });
  }

  for (const orphan of orphans) {
    manualReview.push({
      phoneNumber: orphan.phoneNumber,
      phoneNumberId: String(orphan._id),
      type: "orphan",
      issues: ["orphan_active_number"],
      telnyxPhoneNumberId: orphan.telnyxPhoneNumberId || null,
      evidence: { mongo: true, telnyx: telnyx.numbers.has(orphan.phoneNumber) },
    });
  }

  return {
    totalNumbers: mongoNumbers.length,
    assigned: assigned.length,
    orphans: orphans.length,
    duplicates: dupAgg.length,
    inactiveAssigned: inactiveAssigned.length,
    telnyxInventoryChecked: telnyx.available,
    telnyxInventoryCount: telnyx.numbers.size,
    recovered: recovered.length,
    manualReviewRequired: manualReview.length,
    manualReview,
    status: dupAgg.length || orphans.length || manualReview.some((m) => m.issues?.includes("owner_user_missing"))
      ? "FAIL"
      : manualReview.length
        ? "WARN"
        : "PASS",
  };
}
