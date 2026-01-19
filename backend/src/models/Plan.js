import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },

    price: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: "USD"
    },

    limits: {
      minutesTotal: {
        type: Number,
        required: true
      },
      smsTotal: {
        type: Number,
        required: true
      },
      numbersTotal: {
        type: Number,
        required: true
      }
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active"
    }
  },
  { timestamps: true }
);

export default mongoose.model("Plan", planSchema);
