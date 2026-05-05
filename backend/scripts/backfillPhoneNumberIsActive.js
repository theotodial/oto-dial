import mongoose from "mongoose";
import dotenv from "dotenv";
import PhoneNumber from "../src/models/PhoneNumber.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/oto-dial";

async function backfillPhoneNumberIsActive() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const docs = await PhoneNumber.find({ isActive: { $exists: false } }).select(
    "_id phoneNumber status isActive"
  );
  console.log(`🔎 Numbers missing isActive: ${docs.length}`);

  let updated = 0;
  for (const doc of docs) {
    doc.isActive = doc.status === "active";
    await doc.save();
    updated += 1;
  }

  console.log("✅ Backfill complete", { updated });
}

backfillPhoneNumberIsActive()
  .catch((error) => {
    console.error("❌ backfillPhoneNumberIsActive failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
