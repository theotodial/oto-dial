import TelecomChaosSnapshot from "../models/TelecomChaosSnapshot.js";

/**
 * Forensics-only persistence. Never mutates balances.
 * @param {object} doc
 */
export async function persistTelecomChaosSnapshot(doc) {
  try {
    return await TelecomChaosSnapshot.create({
      snapshotType: doc.snapshotType,
      callId: doc.callId || null,
      userId: doc.userId || null,
      workerId: doc.workerId != null ? String(doc.workerId) : null,
      hostname: doc.hostname != null ? String(doc.hostname) : null,
      processId: doc.processId != null ? Number(doc.processId) : null,
      economicVersion: doc.economicVersion != null ? Number(doc.economicVersion) : null,
      callStateVersion: doc.callStateVersion != null ? String(doc.callStateVersion) : null,
      timelineHash: doc.timelineHash != null ? String(doc.timelineHash) : "",
      journalHash: doc.journalHash != null ? String(doc.journalHash) : "",
      replayHash: doc.replayHash != null ? String(doc.replayHash) : "",
      metadata: doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {},
      createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
    });
  } catch {
    return null;
  }
}
