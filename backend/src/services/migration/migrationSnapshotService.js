/**
 * Snapshot + rollback core for the Telecom Credit migration.
 *
 * Captures the pre-migration state of the documents the migration mutates so the
 * migration is fully reversible. All operations are idempotent.
 *
 * Captured collections:
 *   - subscriptions: full documents (credit fields, plan refs, limits, status)
 *   - users:         credit/legacy billing field subset only (avoids PII bloat)
 *   - plans:         full documents (credit allowances, coming-soon flags, stripe ids)
 *
 * Phone numbers are intentionally NOT captured/mutated: ownership lives on
 * PhoneNumber.userId and the migration never touches it.
 */

import crypto from "node:crypto";
import MigrationSnapshot from "../../models/MigrationSnapshot.js";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import Plan from "../../models/Plan.js";
import PhoneNumber from "../../models/PhoneNumber.js";

export const MANIFEST_COLLECTION = "__manifest__";

const USER_SNAPSHOT_FIELDS = [
  "remainingCredits",
  "totalCreditsUsed",
  "reservedCredits",
  "lifetimeCreditsPurchased",
  "minutesUsed",
  "smsUsed",
  "currentPlanId",
  "currentSubscriptionLimits",
  "activeSubscriptionId",
];

function pickUserFields(userDoc) {
  const out = {};
  for (const field of USER_SNAPSHOT_FIELDS) {
    if (userDoc[field] !== undefined) out[field] = userDoc[field];
  }
  return out;
}

function checksumRows(rows) {
  const hash = crypto.createHash("sha256");
  for (const row of rows) {
    hash.update(`${row.collectionName}:${String(row.documentId)}\n`);
  }
  return hash.digest("hex");
}

export async function snapshotExists(snapshotName) {
  const manifest = await MigrationSnapshot.findOne({
    snapshotName,
    collectionName: MANIFEST_COLLECTION,
  }).lean();
  return Boolean(manifest);
}

/**
 * Capture a snapshot. Idempotent: if the manifest already exists and `force` is false,
 * the existing snapshot is returned unchanged.
 *
 * @param {object} opts
 * @param {string} opts.snapshotName
 * @param {boolean} [opts.force] - drop and recapture if a snapshot with this name exists
 * @param {(msg:string)=>void} [opts.log]
 */
export async function createSnapshot({ snapshotName, force = false, log = () => {} } = {}) {
  if (!snapshotName) throw new Error("snapshotName required");

  const exists = await snapshotExists(snapshotName);
  if (exists && !force) {
    log(`[snapshot] '${snapshotName}' already exists — skipping (idempotent).`);
    const manifest = await MigrationSnapshot.findOne({
      snapshotName,
      collectionName: MANIFEST_COLLECTION,
    }).lean();
    return { ok: true, skipped: true, manifest: manifest?.data || null };
  }

  if (exists && force) {
    log(`[snapshot] '${snapshotName}' exists — force recapture, dropping old rows.`);
    await MigrationSnapshot.deleteMany({ snapshotName });
  }

  const capturedAt = new Date();
  const counts = { subscriptions: 0, users: 0, plans: 0 };
  const indexRows = [];

  // Phone numbers are NOT mutated by the migration; we record baseline counts so verification
  // can prove no purchased number lost its owner.
  const phoneNumbersTotal = await PhoneNumber.countDocuments({});
  const phoneNumbersAssigned = await PhoneNumber.countDocuments({
    userId: { $ne: null, $exists: true },
  });

  // Subscriptions (full docs)
  for await (const sub of Subscription.find({}).lean().cursor()) {
    await MigrationSnapshot.updateOne(
      { snapshotName, collectionName: "subscriptions", documentId: sub._id },
      { $set: { data: sub, createdAt: capturedAt } },
      { upsert: true }
    );
    counts.subscriptions += 1;
    indexRows.push({ collectionName: "subscriptions", documentId: sub._id });
  }
  log(`[snapshot] captured ${counts.subscriptions} subscriptions`);

  // Users (credit/legacy field subset)
  for await (const user of User.find({})
    .select(USER_SNAPSHOT_FIELDS.join(" "))
    .lean()
    .cursor()) {
    await MigrationSnapshot.updateOne(
      { snapshotName, collectionName: "users", documentId: user._id },
      { $set: { data: pickUserFields(user), createdAt: capturedAt } },
      { upsert: true }
    );
    counts.users += 1;
    indexRows.push({ collectionName: "users", documentId: user._id });
  }
  log(`[snapshot] captured ${counts.users} users`);

  // Plans (full docs)
  for await (const plan of Plan.find({}).lean().cursor()) {
    await MigrationSnapshot.updateOne(
      { snapshotName, collectionName: "plans", documentId: plan._id },
      { $set: { data: plan, createdAt: capturedAt } },
      { upsert: true }
    );
    counts.plans += 1;
    indexRows.push({ collectionName: "plans", documentId: plan._id });
  }
  log(`[snapshot] captured ${counts.plans} plans`);

  const manifestData = {
    snapshotName,
    capturedAt,
    counts,
    phoneNumbers: { total: phoneNumbersTotal, assigned: phoneNumbersAssigned },
    checksum: checksumRows(indexRows),
    status: "complete",
  };

  await MigrationSnapshot.updateOne(
    { snapshotName, collectionName: MANIFEST_COLLECTION, documentId: null },
    { $set: { data: manifestData, createdAt: capturedAt } },
    { upsert: true }
  );

  log(`[snapshot] manifest written: ${JSON.stringify(manifestData.counts)}`);
  return { ok: true, skipped: false, manifest: manifestData };
}

/**
 * Restore documents from a snapshot. Idempotent and safe to re-run.
 * Refuses to run if the named snapshot's manifest is missing/incomplete.
 *
 * @param {object} opts
 * @param {string} opts.snapshotName
 * @param {(msg:string)=>void} [opts.log]
 */
export async function restoreSnapshot({ snapshotName, log = () => {} } = {}) {
  if (!snapshotName) throw new Error("snapshotName required");

  const manifestRow = await MigrationSnapshot.findOne({
    snapshotName,
    collectionName: MANIFEST_COLLECTION,
  }).lean();
  if (!manifestRow?.data) {
    throw new Error(
      `Refusing to roll back: no manifest found for snapshot '${snapshotName}'.`
    );
  }
  if (manifestRow.data.status !== "complete") {
    throw new Error(
      `Refusing to roll back: snapshot '${snapshotName}' is not 'complete' (status=${manifestRow.data.status}).`
    );
  }

  const restored = { subscriptions: 0, users: 0, plans: 0 };

  // Subscriptions: full-document restore (replace preserves the captured pre-migration state).
  for await (const row of MigrationSnapshot.find({
    snapshotName,
    collectionName: "subscriptions",
  })
    .lean()
    .cursor()) {
    await Subscription.replaceOne({ _id: row.documentId }, row.data, { upsert: true });
    restored.subscriptions += 1;
  }
  log(`[rollback] restored ${restored.subscriptions} subscriptions`);

  // Users: restore only the captured credit/legacy field subset.
  for await (const row of MigrationSnapshot.find({
    snapshotName,
    collectionName: "users",
  })
    .lean()
    .cursor()) {
    await User.updateOne({ _id: row.documentId }, { $set: row.data || {} });
    restored.users += 1;
  }
  log(`[rollback] restored ${restored.users} user credit fields`);

  // Plans: full-document restore.
  for await (const row of MigrationSnapshot.find({
    snapshotName,
    collectionName: "plans",
  })
    .lean()
    .cursor()) {
    await Plan.replaceOne({ _id: row.documentId }, row.data, { upsert: true });
    restored.plans += 1;
  }
  log(`[rollback] restored ${restored.plans} plans`);

  return { ok: true, restored };
}
