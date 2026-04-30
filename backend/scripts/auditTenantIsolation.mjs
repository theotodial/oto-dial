import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "../config/db.js";

async function main() {
  dotenv.config();
  await connectDB();
  const db = mongoose.connection.db;

  const duplicateNumbers = await db
    .collection("phonenumbers")
    .aggregate([
      {
        $group: {
          _id: "$phoneNumber",
          count: { $sum: 1 },
          users: { $addToSet: "$userId" },
        },
      },
      {
        $match: {
          count: { $gt: 1 },
        },
      },
    ])
    .toArray();

  const orphanNumbers = await db
    .collection("phonenumbers")
    .countDocuments({ $or: [{ userId: { $exists: false } }, { userId: null }] });
  const orphanSms = await db
    .collection("sms")
    .countDocuments({ $or: [{ user: { $exists: false } }, { user: null }] });
  const orphanCalls = await db
    .collection("calls")
    .countDocuments({ $or: [{ user: { $exists: false } }, { user: null }] });

  const uniqueIndexName = "phoneNumber_unique_isolation";
  const indexes = await db.collection("phonenumbers").indexes();
  const hasUniquePhoneNumber = indexes.some(
    (idx) => idx.unique === true && idx.key && idx.key.phoneNumber === 1
  );

  let createdIndex = null;
  if (!hasUniquePhoneNumber) {
    createdIndex = await db.collection("phonenumbers").createIndex(
      { phoneNumber: 1 },
      {
        name: uniqueIndexName,
        unique: true,
      }
    );
  }

  const report = {
    duplicateNumberCount: duplicateNumbers.length,
    duplicateNumbers,
    orphanCounts: {
      phonenumbers: orphanNumbers,
      sms: orphanSms,
      calls: orphanCalls,
    },
    uniqueIndex: {
      alreadyPresent: hasUniquePhoneNumber,
      createdIndex,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[auditTenantIsolation] failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
