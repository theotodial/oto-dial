import mongoose from "mongoose";
import dotenv from "dotenv";
import PhoneNumber from "../src/models/PhoneNumber.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/oto-dial";

async function dedupePhoneNumbers() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const duplicates = await PhoneNumber.aggregate([
    {
      $group: {
        _id: "$phoneNumber",
        ids: { $push: "$_id" },
        createdAts: { $push: "$createdAt" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  console.log(`🔎 Duplicate groups found: ${duplicates.length}`);
  let totalMarkedReleased = 0;

  for (const group of duplicates) {
    const rows = await PhoneNumber.find({ phoneNumber: group._id })
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    if (rows.length < 2) continue;

    const keeper = rows[0];
    const rest = rows.slice(1);
    const duplicateIds = rest.map((x) => x._id);

    console.log("⚠️ Duplicate phoneNumber group", {
      phoneNumber: group._id,
      keeperId: String(keeper._id),
      duplicateIds: duplicateIds.map(String),
    });

    const result = await PhoneNumber.updateMany(
      { _id: { $in: duplicateIds } },
      { $set: { status: "released" } }
    );

    totalMarkedReleased += Number(result.modifiedCount || 0);
  }

  console.log("✅ Dedupe migration complete", {
    duplicateGroups: duplicates.length,
    markedReleased: totalMarkedReleased,
  });
}

dedupePhoneNumbers()
  .catch((error) => {
    console.error("❌ dedupePhoneNumbers failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
