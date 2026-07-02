/**
 * Automated billing & credit reconciliation.
 *
 * Verifies wallet ↔ ledger consistency, per-call billable events, SMS segment
 * deductions, duplicate/missing charges, negative balances, and reservation release.
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Call from "../models/Call.js";
import SMS from "../models/SMS.js";
import CreditLedger from "../models/CreditLedger.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import {
  rebuildBalanceFromCreditLedger,
  balancesRoughlyEqual,
} from "./ledgerReconstructionService.js";
import { reconcileUserReservations } from "./reservationReconciliationService.js";
import { rateSms, rateConnectedSeconds, rateCallEvent, isRatingV1Enabled } from "./telecomRatingEngine.js";
import { CONNECTED_INTERVAL_SECONDS } from "../config/creditConfig.js";
import { enrichLedgerRow, formatCustomerTimelineEntry } from "./creditLedgerFormatService.js";

const EPS = 1e-4;
const TERMINAL_CALL_STATUSES = ["completed", "failed", "rejected", "canceled", "busy", "no-answer"];
const ACTIVE_CALL_STATUSES = ["queued", "initiated", "dialing", "ringing", "early-media", "answered", "in-progress"];

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function issue(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

/**
 * Wallet: Subscription vs User cache vs CreditLedger tail balance.
 */
export async function reconcileUserWallet(userId) {
  const uid = toObjectId(userId);
  if (!uid) {
    return { ok: false, error: "invalid_user_id", issues: [] };
  }

  const [user, subscription, ledgerReplay] = await Promise.all([
    User.findById(uid).select("email remainingCredits reservedCredits").lean(),
    Subscription.findOne({ userId: uid })
      .sort({ createdAt: -1 })
      .select("remainingCredits reservedCredits telecomCredits")
      .lean(),
    rebuildBalanceFromCreditLedger(uid),
  ]);

  if (!user) {
    return { ok: false, error: "user_not_found", issues: [] };
  }

  const issues = [];
  const subBal = num(subscription?.remainingCredits);
  const subRes = num(subscription?.reservedCredits);
  const userBal = num(user.remainingCredits);
  const userRes = num(user.reservedCredits);
  const ledgerBal = ledgerReplay.balance;
  const hasLedger = (ledgerReplay.rowCount || 0) > 0;

  if (userBal < -EPS || subBal < -EPS || (hasLedger && ledgerBal < -EPS)) {
    issues.push(
      issue("critical", "negative_balance", "User has a negative credit balance", {
        userBalance: userBal,
        subscriptionBalance: subBal,
        ledgerBalance: ledgerBal,
      })
    );
  }

  if (subscription && !balancesRoughlyEqual(subBal, userBal)) {
    issues.push(
      issue("critical", "subscription_user_cache_drift", "Subscription remainingCredits does not match User cache", {
        subscriptionBalance: subBal,
        userBalance: userBal,
        diff: subBal - userBal,
      })
    );
  }

  if (subscription && !balancesRoughlyEqual(subRes, userRes)) {
    issues.push(
      issue("warning", "reserved_cache_drift", "Subscription reservedCredits does not match User cache", {
        subscriptionReserved: subRes,
        userReserved: userRes,
        diff: subRes - userRes,
      })
    );
  }

  if (hasLedger && !balancesRoughlyEqual(ledgerBal, subBal)) {
    issues.push(
      issue("critical", "ledger_subscription_drift", "CreditLedger balance does not match Subscription wallet", {
        ledgerBalance: ledgerBal,
        subscriptionBalance: subBal,
        diff: ledgerBal - subBal,
      })
    );
  } else if (hasLedger && ledgerReplay.chainValid === false) {
    issues.push(
      issue("warning", "ledger_chain_historical_gap", "CreditLedger balanceBefore/After chain has historical gaps (tail matches wallet)", {
        rowCount: ledgerReplay.rowCount,
        ledgerBalance: ledgerBal,
        subscriptionBalance: subBal,
      })
    );
  }

  const reservationCheck = await reconcileUserReservations(uid);
  if (!reservationCheck.healthy && reservationCheck.drift != null) {
    issues.push(
      issue("warning", "reservation_drift", "User reservedCredits does not match open EconomicTimelines", {
        userReserved: reservationCheck.userReservedCredits,
        timelineReserved: reservationCheck.timelineReservedCredits,
        drift: reservationCheck.drift,
        openCallCount: reservationCheck.openCallCount,
      })
    );
  }

  return {
    ok: issues.length === 0,
    userId: String(uid),
    email: user.email || null,
    wallet: {
      userBalance: userBal,
      userReserved: userRes,
      subscriptionBalance: subBal,
      subscriptionReserved: subRes,
      ledgerBalance: ledgerBal,
      ledgerChainValid: ledgerReplay.chainValid,
      ledgerRowCount: ledgerReplay.rowCount,
    },
    issues,
  };
}

/**
 * Per-call billing: billable events, intervals, duplicates, missing charges, reservation release.
 */
export async function reconcileUserCalls(userId, options = {}) {
  const uid = toObjectId(userId);
  if (!uid) return { ok: false, error: "invalid_user_id", issues: [], calls: [] };

  const since = options.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 200));

  const calls = await Call.find({
    user: uid,
    direction: "outbound",
    createdAt: { $gte: since },
  })
    .select(
      "_id status telnyxCallControlId billedCallEvents attemptCharged creditReservationHeld creditReservationReleasedAt totalCreditsCharged durationCreditsCharged callAnsweredAt createdAt updatedAt"
    )
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (!calls.length) {
    return { ok: true, userId: String(uid), issues: [], calls: [], scanned: 0 };
  }

  const callIds = calls.map((c) => c._id);
  const [ledgerRows, timelines] = await Promise.all([
    CreditLedger.find({
      user: uid,
      callId: { $in: callIds },
      type: {
        $in: [
          "call_event_charge",
          "connected_duration_charge",
          "outbound_attempt_charge",
          "reservation_hold",
          "failed_reservation_release",
        ],
      },
    })
      .select("callId type amount reason metadata idempotencyKey createdAt")
      .lean(),
    EconomicTimeline.find({ callId: { $in: callIds } })
      .select("callId reservedCredits consumedCredits releasedCredits settledCredits billedIntervalIndexes finalizedAt timelineState")
      .lean(),
  ]);

  const ledgerByCall = new Map();
  for (const row of ledgerRows) {
    const cid = String(row.callId);
    if (!ledgerByCall.has(cid)) ledgerByCall.set(cid, []);
    ledgerByCall.get(cid).push(row);
  }

  const timelineByCall = new Map(timelines.map((t) => [String(t.callId), t]));
  const issues = [];
  const callReports = [];

  for (const call of calls) {
    const cid = String(call._id);
    const rows = ledgerByCall.get(cid) || [];
    const timeline = timelineByCall.get(cid);
    const callIssues = [];
    const isTerminal = TERMINAL_CALL_STATUSES.includes(call.status);
    const isActive = ACTIVE_CALL_STATUSES.includes(call.status);

    const eventCharges = rows.filter((r) => r.type === "call_event_charge");
    const intervalCharges = rows.filter((r) => r.type === "connected_duration_charge");
    const attemptCharges = rows.filter((r) => r.type === "outbound_attempt_charge");
    const holds = rows.filter((r) => r.type === "reservation_hold");
    const releases = rows.filter((r) => r.type === "failed_reservation_release");

    const eventNamesFromLedger = eventCharges.map(
      (r) => r.metadata?.eventName || r.metadata?.event || r.reason?.replace(/^call_event_/, "")
    );
    const billedEvents = call.billedCallEvents || [];

    // Duplicate event detection
    const eventCountMap = {};
    for (const name of eventNamesFromLedger.filter(Boolean)) {
      eventCountMap[name] = (eventCountMap[name] || 0) + 1;
    }
    for (const [name, count] of Object.entries(eventCountMap)) {
      if (count > 1) {
        callIssues.push(
          issue("critical", "duplicate_call_event", `Call event "${name}" charged ${count} times`, {
            callId: cid,
            eventName: name,
            count,
          })
        );
      }
    }

    // Duplicate interval indexes
    const intervalIndexes = intervalCharges
      .map((r) => r.metadata?.intervalIndex)
      .filter((i) => i != null);
    const intervalSet = new Set();
    for (const idx of intervalIndexes) {
      if (intervalSet.has(idx)) {
        callIssues.push(
          issue("critical", "duplicate_interval", `Interval index ${idx} charged more than once`, {
            callId: cid,
            intervalIndex: idx,
          })
        );
      }
      intervalSet.add(idx);
    }

    if (isRatingV1Enabled()) {
      if (attemptCharges.length > 0 && eventCharges.length > 0) {
        callIssues.push(
          issue("warning", "legacy_and_v1_call_charges", "Call has both legacy attempt charge and v1 event charges", {
            callId: cid,
            attemptCount: attemptCharges.length,
            eventCount: eventCharges.length,
          })
        );
      }
    }

    // Terminal calls should have released reservations
    if (isTerminal && num(call.creditReservationHeld) > 0 && !call.creditReservationReleasedAt) {
      callIssues.push(
        issue("critical", "unreleased_reservation", "Terminal call still has creditReservationHeld without release timestamp", {
          callId: cid,
          status: call.status,
          held: num(call.creditReservationHeld),
        })
      );
    }

    if (isTerminal && timeline && num(timeline.reservedCredits) > EPS) {
      callIssues.push(
        issue("critical", "timeline_unreleased", "Terminal call EconomicTimeline still has reserved credits", {
          callId: cid,
          timelineReserved: num(timeline.reservedCredits),
          timelineState: timeline.timelineState,
        })
      );
    }

    // Answered terminal calls should have interval billing if duration warrants it
    if (
      isTerminal &&
      ["completed", "answered"].includes(call.status) &&
      call.callAnsweredAt
    ) {
      const answeredMs = new Date(call.callAnsweredAt).getTime();
      const elapsedSec = Math.max(0, Math.floor((new Date(call.updatedAt).getTime() - answeredMs) / 1000));
      const expectedBuckets = Math.floor(elapsedSec / CONNECTED_INTERVAL_SECONDS);
      if (expectedBuckets > 0 && intervalCharges.length === 0 && elapsedSec >= CONNECTED_INTERVAL_SECONDS) {
        callIssues.push(
          issue("warning", "missing_interval_charges", "Answered terminal call has no connected duration charges", {
            callId: cid,
            elapsedSeconds: elapsedSec,
            expectedBuckets,
          })
        );
      }
    }

    // Ledger total vs call snapshot (soft check)
    const ledgerDebit = rows
      .filter((r) => num(r.amount) < 0)
      .reduce((sum, r) => sum + Math.abs(num(r.amount)), 0);
    const callTotal = num(call.totalCreditsCharged);
    if (callTotal > 0 && ledgerDebit > 0 && Math.abs(ledgerDebit - callTotal) > 1) {
      callIssues.push(
        issue("warning", "call_total_mismatch", "Call totalCreditsCharged does not match ledger debits", {
          callId: cid,
          callTotal,
          ledgerDebit,
          diff: ledgerDebit - callTotal,
        })
      );
    }

    if (isActive && holds.length === 0 && !call.attemptCharged) {
      callIssues.push(
        issue("info", "active_call_no_hold", "Active outbound call has no reservation hold in ledger", {
          callId: cid,
          status: call.status,
        })
      );
    }

    callReports.push({
      callId: cid,
      status: call.status,
      telnyxCallControlId: call.telnyxCallControlId || null,
      billedCallEvents: billedEvents,
      ledgerEventCount: eventCharges.length,
      intervalCount: intervalCharges.length,
      reservationHeld: num(call.creditReservationHeld),
      reservationReleased: Boolean(call.creditReservationReleasedAt),
      timelineFinalized: Boolean(timeline?.finalizedAt),
      issues: callIssues,
      healthy: callIssues.filter((i) => i.severity !== "info").length === 0,
    });

    issues.push(...callIssues);
  }

  return {
    ok: issues.filter((i) => i.severity === "critical").length === 0,
    userId: String(uid),
    scanned: calls.length,
    issues,
    calls: callReports,
  };
}

/**
 * SMS: one deduction per outbound message, segment-accurate amount.
 */
export async function reconcileUserSms(userId, options = {}) {
  const uid = toObjectId(userId);
  if (!uid) return { ok: false, error: "invalid_user_id", issues: [], sms: [] };

  const since = options.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 200));

  const messages = await SMS.find({
    user: uid,
    direction: "outbound",
    createdAt: { $gte: since },
  })
    .select("_id status smsCostInfo creditsCharged createdAt")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (!messages.length) {
    return { ok: true, userId: String(uid), issues: [], sms: [], scanned: 0 };
  }

  const smsIds = messages.map((m) => m._id);
  const ledgerRows = await CreditLedger.find({
    user: uid,
    smsId: { $in: smsIds },
    type: "sms_charge",
  })
    .select("smsId amount metadata idempotencyKey createdAt")
    .lean();

  const ledgerBySms = new Map();
  for (const row of ledgerRows) {
    const sid = String(row.smsId);
    if (!ledgerBySms.has(sid)) ledgerBySms.set(sid, []);
    ledgerBySms.get(sid).push(row);
  }

  const issues = [];
  const smsReports = [];

  for (const msg of messages) {
    const sid = String(msg._id);
    const charges = ledgerBySms.get(sid) || [];
    const costInfo = msg.smsCostInfo || {};
    const parts = num(costInfo.smsParts) || 1;
    const encoding = costInfo.encoding || "GSM";
    const expectedCost = isRatingV1Enabled()
      ? rateSms({ encoding, segments: parts })
      : num(costInfo.costDeducted);
    const smsIssues = [];

    if (charges.length > 1) {
      smsIssues.push(
        issue("critical", "duplicate_sms_charge", "SMS has multiple sms_charge ledger rows", {
          smsId: sid,
          chargeCount: charges.length,
        })
      );
    }

    const costDeducted = num(costInfo.costDeducted);
    const delivered = !["failed", "undelivered", "delivery_failed"].includes(String(msg.status || "").toLowerCase());

    if (delivered && costDeducted > 0 && charges.length === 0) {
      smsIssues.push(
        issue("critical", "sms_missing_ledger", "SMS marked costDeducted but has no ledger charge", {
          smsId: sid,
          costDeducted,
        })
      );
    }

    if (charges.length === 1 && isRatingV1Enabled()) {
      const charged = Math.abs(num(charges[0].amount));
      if (Math.abs(charged - expectedCost) > EPS) {
        smsIssues.push(
          issue("critical", "sms_amount_mismatch", "SMS ledger charge does not match segment-based expected rate", {
            smsId: sid,
            charged,
            expectedCost,
            segments: parts,
            encoding,
          })
        );
      }
    }

    if (charges.length === 1 && costDeducted > 0 && Math.abs(costDeducted - Math.abs(num(charges[0].amount))) > EPS) {
      smsIssues.push(
        issue("warning", "sms_cost_info_mismatch", "SMS smsCostInfo.costDeducted does not match ledger amount", {
          smsId: sid,
          costDeducted,
          ledgerAmount: Math.abs(num(charges[0].amount)),
        })
      );
    }

    smsReports.push({
      smsId: sid,
      status: msg.status,
      segments: parts,
      encoding,
      expectedCost,
      costDeducted,
      ledgerChargeCount: charges.length,
      issues: smsIssues,
      healthy: smsIssues.length === 0,
    });

    issues.push(...smsIssues);
  }

  return {
    ok: issues.filter((i) => i.severity === "critical").length === 0,
    userId: String(uid),
    scanned: messages.length,
    issues,
    sms: smsReports,
  };
}

/**
 * Full per-user reconciliation (wallet + calls + sms).
 */
export async function reconcileUser(userId, options = {}) {
  const [wallet, calls, sms] = await Promise.all([
    reconcileUserWallet(userId),
    reconcileUserCalls(userId, options),
    reconcileUserSms(userId, options),
  ]);

  const allIssues = [
    ...(wallet.issues || []),
    ...(calls.issues || []),
    ...(sms.issues || []),
  ];

  const critical = allIssues.filter((i) => i.severity === "critical").length;
  const warning = allIssues.filter((i) => i.severity === "warning").length;

  return {
    ok: critical === 0,
    userId: wallet.userId || calls.userId || sms.userId,
    email: wallet.email || null,
    summary: {
      critical,
      warning,
      info: allIssues.filter((i) => i.severity === "info").length,
      total: allIssues.length,
    },
    wallet,
    calls,
    sms,
    issues: allIssues,
  };
}

/**
 * System-wide scan: users with recent ledger activity or negative balance.
 */
export async function runSystemReconciliation(options = {}) {
  const since = options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const userBatch = Math.min(500, Math.max(10, Number(options.userBatch) || 100));
  const deepScan = options.deepScan !== false;

  const [recentUsers, negativeUsers] = await Promise.all([
    CreditLedger.distinct("user", { createdAt: { $gte: since } }),
    User.find({ remainingCredits: { $lt: 0 } }).select("_id").limit(50).lean(),
  ]);

  const userIdSet = new Set([
    ...recentUsers.map((id) => String(id)),
    ...negativeUsers.map((u) => String(u._id)),
  ]);
  const userIds = [...userIdSet].slice(0, userBatch);

  const results = [];
  let totalCritical = 0;
  let totalWarning = 0;
  let healthyUsers = 0;

  for (const uid of userIds) {
    const report = deepScan
      ? await reconcileUser(uid, { since, limit: options.perUserLimit || 100 })
      : await reconcileUserWallet(uid);

    if (report.ok) healthyUsers += 1;
    totalCritical += report.summary?.critical ?? report.issues?.filter((i) => i.severity === "critical").length ?? 0;
    totalWarning += report.summary?.warning ?? report.issues?.filter((i) => i.severity === "warning").length ?? 0;

    if (!report.ok || (report.summary?.total ?? 0) > 0) {
      results.push({
        userId: report.userId,
        email: report.email,
        critical: report.summary?.critical ?? 0,
        warning: report.summary?.warning ?? 0,
        topIssues: (report.issues || []).slice(0, 5).map((i) => ({
          code: i.code,
          severity: i.severity,
          message: i.message,
        })),
      });
    }
  }

  const dupKeys = await CreditLedger.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
    { $limit: 20 },
  ]);

  return {
    ok: totalCritical === 0 && dupKeys.length === 0,
    scannedAt: new Date().toISOString(),
    since: since.toISOString(),
    usersScanned: userIds.length,
    healthyUsers,
    usersWithIssues: results.length,
    totalCritical,
    totalWarning,
    duplicateIdempotencyKeys: dupKeys.length,
    duplicateKeySample: dupKeys.map((d) => d._id),
    userReports: results.sort((a, b) => b.critical - a.critical || b.warning - a.warning),
  };
}

/**
 * Admin Credit Ledger Explorer — paginated enriched rows.
 */
export async function getLedgerExplorer(userId, options = {}) {
  const uid = toObjectId(userId);
  if (!uid) return { ok: false, error: "invalid_user_id", entries: [] };

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(options.pageSize) || 50));
  const skip = (page - 1) * pageSize;

  const filter = { user: uid };
  if (options.type) filter.type = options.type;
  if (options.callId) filter.callId = toObjectId(options.callId);
  if (options.smsId) filter.smsId = toObjectId(options.smsId);

  const [rows, total, user] = await Promise.all([
    CreditLedger.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).lean(),
    CreditLedger.countDocuments(filter),
    User.findById(uid).select("email remainingCredits reservedCredits").lean(),
  ]);

  const callIds = [...new Set(rows.filter((r) => r.callId).map((r) => String(r.callId)))];
  const calls = callIds.length
    ? await Call.find({ _id: { $in: callIds } }).select("_id telnyxCallControlId status").lean()
    : [];
  const callMap = Object.fromEntries(calls.map((c) => [String(c._id), c]));

  const entries = rows.map((row) => enrichLedgerRow(row, { callMap }));

  return {
    ok: true,
    userId: String(uid),
    email: user?.email || null,
    currentBalance: num(user?.remainingCredits),
    reservedCredits: num(user?.reservedCredits),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    entries,
  };
}

/**
 * Customer-facing credit timeline (grants + deductions with labels).
 */
export async function getCustomerCreditTimeline(userId, options = {}) {
  const uid = toObjectId(userId);
  if (!uid) return { ok: false, error: "invalid_user_id", timeline: [] };

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 30));
  const skip = (page - 1) * pageSize;

  const [rows, total, snap] = await Promise.all([
    CreditLedger.find({ user: uid })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    CreditLedger.countDocuments({ user: uid }),
    User.findById(uid).select("remainingCredits reservedCredits").lean(),
  ]);

  const callIds = [...new Set(rows.filter((r) => r.callId).map((r) => String(r.callId)))];
  const smsIds = [...new Set(rows.filter((r) => r.smsId).map((r) => String(r.smsId)))];

  const [calls, smsRows] = await Promise.all([
    callIds.length
      ? Call.find({ _id: { $in: callIds } })
          .select("_id telnyxCallControlId toNumber phoneNumber fromNumber direction billedSeconds durationSeconds answeredDuration")
          .lean()
      : [],
    smsIds.length
      ? SMS.find({ _id: { $in: smsIds } })
          .select("_id to from externalNumber direction smsParts smsCostInfo encoding")
          .lean()
      : [],
  ]);

  const callMap = Object.fromEntries(calls.map((c) => [String(c._id), c]));
  const smsMap = Object.fromEntries(smsRows.map((s) => [String(s._id), s]));

  const timeline = rows
    .filter((r) => r.type !== "reservation_hold" || options.includeHolds)
    .map((row) => {
      const enriched = enrichLedgerRow(row, { callMap });
      return formatCustomerTimelineEntry(enriched, { callMap, smsMap });
    });

  return {
    ok: true,
    balance: num(snap?.remainingCredits),
    reservedCredits: num(snap?.reservedCredits),
    availableCredits: num(snap?.remainingCredits) - num(snap?.reservedCredits),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    timeline,
  };
}
