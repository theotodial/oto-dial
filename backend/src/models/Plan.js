import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },

    priceMonthly: {
      type: Number,
      required: true
    },

    included: {
      minutes: Number,
      sms: Number,
      numbers: Number
    },

    rates: {
      perMinute: Number,
      perSms: Number
    },

    addons: {
      minutes1000: Number,
      sms1000: Number
    },

    features: {
      tollFreeAllowed: Boolean
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Plan", planSchema);
