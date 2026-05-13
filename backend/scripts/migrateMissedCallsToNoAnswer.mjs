import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("[migrate-missed-calls] Missing MONGO_URI / MONGODB_URI");
  process.exit(1);
}

const callSchema = new mongoose.Schema(
  {
    status: String,
    failReason: String,
    hangupCause: String,
    updatedAt: Date,
  },
  { collection: "calls", strict: false }
);
const Call = mongoose.model("CallMigration", callSchema);

async function run() {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  console.log("[migrate-missed-calls] Connected");

  const query = { status: "missed" };
  const total = await Call.countDocuments(query);
  console.log("[migrate-missed-calls] Found", total, "documents with status=missed");

  if (total === 0) {
    await mongoose.disconnect();
    console.log("[migrate-missed-calls] Nothing to migrate");
    return;
  }

  const result = await Call.updateMany(query, {
    $set: {
      status: "no-answer",
      updatedAt: new Date(),
    },
  });

  console.log("[migrate-missed-calls] Modified:", result.modifiedCount || 0);
  await mongoose.disconnect();
  console.log("[migrate-missed-calls] Done");
}

run().catch(async (err) => {
  console.error("[migrate-missed-calls] Failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
