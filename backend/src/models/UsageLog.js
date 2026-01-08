import mongoose from "mongoose";
import { PLANS } from "../../config/plans.js";
import User from "../models/User.js";

const usageLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true
    },

    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: true
    },

    minutesUsed: {
      type: Number,
      required: true
    },

    type: {
      type: String,
      enum: ["call"],
      default: "call"
    }
  },
  { timestamps: true }
);
export const usageGuard = ({ type }) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // For now everyone is on basic plan
      const plan = PLANS.basic;

      if (type === "call" && user.minutesUsed >= plan.minutes) {
        return res.status(403).json({
          error: "Call limit reached. Upgrade plan."
        });
      }

      if (type === "sms" && user.smsUsed >= plan.sms) {
        return res.status(403).json({
          error: "SMS limit reached. Upgrade plan."
        });
      }

      next();
    } catch (err) {
      console.error("Usage guard error:", err);
      res.status(500).json({ error: "Usage validation failed" });
    }
  };
};
export default mongoose.model("UsageLog", usageLogSchema);
