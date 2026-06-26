import mongoose from "mongoose";

/**
 * Reversible migration safety net.
 *
 * One document per captured source document. A snapshot is identified by `snapshotName`.
 * `collectionName` is the Mongo collection the row was captured from; `documentId` is the
 * original `_id`; `data` is the full lean document at capture time.
 *
 * A special row with `collectionName === "__manifest__"` stores the snapshot manifest
 * (counts, checksum, status) so rollback can refuse to run against an unknown/partial snapshot.
 */
const migrationSnapshotSchema = new mongoose.Schema(
  {
    snapshotName: {
      type: String,
      required: true,
      index: true,
    },
    collectionName: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

// One captured row per (snapshot, collection, document). Re-running snapshot is idempotent.
migrationSnapshotSchema.index(
  { snapshotName: 1, collectionName: 1, documentId: 1 },
  { unique: true }
);

export default mongoose.model("MigrationSnapshot", migrationSnapshotSchema);
