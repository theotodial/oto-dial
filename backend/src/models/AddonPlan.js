import mongoose from "mongoose";

const addonPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
    },

    // "minutes" or "sms"
    type: {
      type: String,
      enum: ["minutes", "sms"],
      required: true
    },

    price: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: "USD"
    },

    // Amount of minutes or SMS this add-on grants
    quantity: {
      type: Number,
      required: true
    },

    stripePriceId: {
      type: String,
      required: true
    },

    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("AddonPlan", addonPlanSchema);

