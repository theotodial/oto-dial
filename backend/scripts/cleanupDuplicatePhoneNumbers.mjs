/**
 * Report (or remove) duplicate PhoneNumber rows sharing the same E.164.
 *
 * Usage:
 *   node scripts/cleanupDuplicatePhoneNumbers.mjs
 *   node scripts/cleanupDuplicatePhoneNumbers.mjs --apply
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import PhoneNumber from "../src/models/PhoneNumber.js";

const apply = process.argv.includes("--apply");

async function run() {
  await connectDB();

  const dupGroups = await PhoneNumber.aggregate([
    { $group: { _id: "$number", ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  const report = {
    ranAt: new Date().toISOString(),
    apply,
    duplicateGroups: dupGroups.length,
    groups: [],
    removed: 0,
  };

  for (const g of dupGroups) {
    const ids = g.ids.map(String);
    const rows = await PhoneNumber.find({ _id: { $in: g.ids } })
      .select("_id number userId assignedTo status createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const keep = rows.find((r) => r.userId || r.assignedTo) || rows[0];
    const removeIds = rows.filter((r) => String(r._id) !== String(keep._id)).map((r) => r._id);

    report.groups.push({
      number: g._id,
      count: g.count,
      keepId: String(keep._id),
      removeIds: removeIds.map(String),
    });

    if (apply && removeIds.length) {
      const res = await PhoneNumber.deleteMany({ _id: { $in: removeIds } });
      report.removed += res.deletedCount || 0;
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect().catch(() => {});
  process.exit(dupGroups.length > 0 && !apply ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
