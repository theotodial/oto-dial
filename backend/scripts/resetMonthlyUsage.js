import mongoose from "mongoose";
import dotenv from "dotenv";
import Subscription from "../src/models/Subscription.js";

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const result = await Subscription.updateMany(
      {},
      {
        $set: {
          "usage.minutesUsed": 0,
          "usage.smsUsed": 0,
        },
      }
    );

    console.log("Monthly usage reset complete:", result.modifiedCount);
    process.exit(0);
  } catch (err) {
    console.error("Monthly usage reset failed:", err);
    process.exit(1);
  }
};

run();
