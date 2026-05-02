import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/oto-dial";

const planDocument = {
  name: "1000 SMS",
  type: "campaign",
  stripePriceId: "price_1TOk5pCxZc7GK7QKlvKNFyuN",
  price: 70,
  smsLimit: 1000,
  callMinutes: 0,
  features: {
    smsCampaignEnabled: true,
    voiceEnabled: false
  },
  createdAt: new Date()
};

async function run() {
  await mongoose.connect(MONGODB_URI);
  try {
    const db = mongoose.connection.db;
    await db.collection("subscriptionPlans").updateOne(
      { stripePriceId: planDocument.stripePriceId },
      {
        $set: {
          ...planDocument,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    console.log("✅ Upserted 1000 SMS into subscriptionPlans collection");
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("❌ Failed to upsert 1000 SMS plan:", err);
  process.exit(1);
});
