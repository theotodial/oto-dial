import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../src/models/User.js";
import { computeUsage } from "../src/services/usageComputationService.js";

dotenv.config();

/**
 * One-time recovery audit: logs computed SMS/call usage per user from Mongo collections.
 * Does not write any documents.
 */
const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const users = await User.find().select("_id email").lean();
    for (const user of users) {
      const usage = await computeUsage(user._id);
      console.log({
        user: user.email,
        smsUsed: usage.smsUsed,
        minutesUsed: usage.minutesUsed,
      });
    }

    process.exit(0);
  } catch (err) {
    console.error("logUserUsageRecovery failed:", err);
    process.exit(1);
  }
};

run();
