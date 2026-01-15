import "dotenv/config";
import mongoose from "mongoose";
import { getTelnyx } from "../config/telnyx.js";
import PhoneNumber from "../src/models/PhoneNumber.js";

// =====================
// ENV CHECK
// =====================
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI missing");
  process.exit(1);
}

if (!process.env.TELNYX_API_KEY) {
  console.error("❌ TELNYX_API_KEY missing");
  process.exit(1);
}

// =====================
// CONNECT DB
// =====================
console.log("🔌 Connecting to MongoDB...");
await mongoose.connect(process.env.MONGODB_URI);
console.log("✅ MongoDB connected");

// =====================
// INIT TELNYX
// =====================
const telnyx = getTelnyx();
if (!telnyx) {
  console.error("❌ Telnyx failed to initialize");
  process.exit(1);
}

// =====================
// MIGRATION
// =====================
async function run() {
  console.log("🔧 Starting Telnyx SMS repair migration...");

  const numbers = await PhoneNumber.find({ status: "active" });
  console.log(`📞 Found ${numbers.length} phone numbers`);

  for (const number of numbers) {
    console.log(`➡ Processing ${number.phoneNumber}`);

    if (number.messagingProfileId) {
      console.log("✅ Messaging profile already exists");
      continue;
    }

    // 1️⃣ Create messaging profile WITH whitelist
    const profile = await telnyx.messagingProfiles.create({
      name: `profile-${number.phoneNumber}`,
      whitelisted_destinations: ["US"]
    });

    const profileId = profile.data.id;
    console.log("🆕 Created messaging profile:", profileId);

    // 2️⃣ UPDATE TELNYX PHONE NUMBER (THIS IS THE KEY FIX)
    await telnyx.phoneNumbers.update(number.telnyxPhoneNumberId, {
      messaging_profile_id: profileId
    });

    console.log("📎 Phone number attached to messaging profile");

    // 3️⃣ SAVE TO DB
    number.messagingProfileId = profileId;
    await number.save();

    console.log("✅ Saved messaging profile to DB");
  }

  console.log("🎉 Migration complete");
  process.exit(0);
}

run().catch((err) => {
  console.error(
    "🔥 Migration failed:",
    err.response?.data || err.message
  );
  process.exit(1);
});
