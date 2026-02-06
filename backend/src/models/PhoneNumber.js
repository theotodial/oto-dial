import mongoose from "mongoose";

const phoneNumberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    phoneNumber: {
      type: String,
      required: true,
      unique: true
    },

    status: {
      type: String,
      enum: ["active", "released"],
      default: "active"
    },

    telnyxPhoneNumberId: {
      type: String,
      required: true
    },

    messagingProfileId: {
      type: String,
      default: null
    },

    // Region information from Telnyx
    country: {
      type: String,
      default: "United States"
    },

    // Country metadata for global support
    countryCode: {
      type: String,
      default: "US"
    },

    countryName: {
      type: String,
      default: "United States"
    },

    iso2: {
      type: String,
      default: "US"
    },

    lockedCountry: {
      type: Boolean,
      default: true
    },

    state: {
      type: String,
      default: null
    },

    city: {
      type: String,
      default: null
    },

    regionInformation: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    // Enhanced cost tracking
    monthlyCost: {
      type: Number,
      default: 0
    },

    oneTimeFees: {
      type: Number,
      default: 0
    },

    carrierGroup: {
      type: String,
      default: null
    },

    extraFees: {
      type: Number,
      default: 0
    },

    purchaseDate: {
      type: Date,
      default: Date.now
    },

    // Cost sync tracking
    costPending: {
      type: Boolean,
      default: false
    },

    costSyncError: {
      type: String,
      default: null
    },

    costSyncedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("PhoneNumber", phoneNumberSchema);
