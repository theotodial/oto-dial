import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import IsolationSecurityAlert from "../../models/IsolationSecurityAlert.js";
import { normalizeThreadPhone } from "../../utils/smsThreadKey.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";

const AGENT = "multi-tenant-isolation-agent";

async function upsertAlert({ severity, event, fingerprint, evidence, quarantineStatus = "open" }) {
  await IsolationSecurityAlert.findOneAndUpdate(
    { fingerprint },
    {
      $setOnInsert: {
        severity,
        event,
        evidence,
        quarantineStatus,
        firstSeenAt: new Date(),
      },
      $set: { lastSeenAt: new Date(), evidence },
      $inc: { occurrences: 1 },
    },
    { upsert: true }
  );
}

export const multiTenantIsolationAgent = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_ISOLATION_INTERVAL_MS || 15 * 60 * 1000),
  leaseMs: Number(process.env.AGENT_ISOLATION_LEASE_MS || 10 * 60 * 1000),

  async run({ log }) {
    const duplicateNumbers = await PhoneNumber.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$phoneNumber", users: { $addToSet: "$userId" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 25 },
    ]);

    for (const row of duplicateNumbers) {
      const fingerprint = `duplicate-phone:${row._id}`;
      const evidence = { phoneNumber: row._id, users: row.users.map(String), count: row.count };
      await upsertAlert({
        severity: "critical",
        event: "duplicate_active_phone_number",
        fingerprint,
        evidence,
        quarantineStatus: "quarantined",
      });
      emitAgentAlert(AGENT, "critical", "duplicate_active_phone_number", evidence);
    }

    const missingThreadFields = await SMS.find({
      $or: [
        { user: { $exists: false } },
        { user: null },
        { threadKey: { $in: [null, ""] } },
        { ownedNumber: { $in: [null, ""] } },
        { externalNumber: { $in: [null, ""] } },
      ],
    })
      .select("_id user direction from to ownedNumber externalNumber threadKey createdAt")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    for (const sms of missingThreadFields) {
      await upsertAlert({
        severity: "warning",
        event: "message_missing_thread_isolation_fields",
        fingerprint: `sms-thread-fields:${sms._id}`,
        evidence: sms,
        quarantineStatus: "quarantined",
      });
    }

    const recentMessages = await SMS.find({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      ownedNumber: { $nin: [null, ""] },
      user: { $ne: null },
    })
      .select("_id user ownedNumber from to direction")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    let wrongOwnerCount = 0;
    for (const sms of recentMessages) {
      const owned = normalizeThreadPhone(sms.ownedNumber);
      const candidates = Array.from(new Set([owned, owned?.replace(/\D/g, ""), `+${owned?.replace(/\D/g, "")}`].filter(Boolean)));
      const owner = await PhoneNumber.findOne({ phoneNumber: { $in: candidates }, status: "active" })
        .select("_id userId phoneNumber")
        .lean();
      if (owner && String(owner.userId) !== String(sms.user)) {
        wrongOwnerCount += 1;
        const evidence = {
          smsId: String(sms._id),
          smsUser: String(sms.user),
          numberOwner: String(owner.userId),
          ownedNumber: sms.ownedNumber,
          phoneNumberRecord: String(owner._id),
        };
        await upsertAlert({
          severity: "critical",
          event: "message_attached_to_wrong_number_owner",
          fingerprint: `sms-owner:${sms._id}`,
          evidence,
          quarantineStatus: "quarantined",
        });
        emitAgentAlert(AGENT, "critical", "message_attached_to_wrong_number_owner", evidence);
      }
    }

    log("info", "isolation_scan_complete", {
      duplicateNumbers: duplicateNumbers.length,
      missingThreadFields: missingThreadFields.length,
      wrongOwnerCount,
    });

    return {
      duplicateNumbers: duplicateNumbers.length,
      missingThreadFields: missingThreadFields.length,
      wrongOwnerCount,
    };
  },
};
