import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/User.js";
import { migrateUserMinutesToCredits } from "../src/services/creditMigrationService.js";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/oto-dial";

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log("[migrateMinutesToCredits] connected");

  const cursor = User.find({})
    .select("_id remainingMinutes remainingCredits")
    .cursor();

  let scanned = 0;
  let migrated = 0;
  for await (const user of cursor) {
    scanned += 1;
    const result = await migrateUserMinutesToCredits(user);
    if (result?.migratedAmount > 0) migrated += 1;
    if (scanned % 200 === 0) {
      console.log("[migrateMinutesToCredits] progress", { scanned, migrated });
    }
  }

  console.log("[migrateMinutesToCredits] done", { scanned, migrated });
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[migrateMinutesToCredits] failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
