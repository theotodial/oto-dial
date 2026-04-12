import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const customPackageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    minutesAllowed: {
      type: Number,
      default: 0,
      min: 0,
    },
    smsAllowed: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    isCallEnabled: {
      type: Boolean,
      default: true,
    },
    isSmsEnabled: {
      type: Boolean,
      default: true,
    },
    allowedCountries: {
      type: [String],
      default: [],
    },
    blockedCountries: {
      type: [String],
      default: [],
    },
    overridePlan: {
      type: Boolean,
      default: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

customPackageSchema.index({ userId: 1, active: 1, expiresAt: 1 });
customPackageSchema.plugin(mongoPerformancePlugin, { label: "customPackage" });

const CustomPackage = mongoose.model("CustomPackage", customPackageSchema);

export default CustomPackage;
