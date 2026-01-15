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
    }
  },
  { timestamps: true }
);

export default mongoose.model("PhoneNumber", phoneNumberSchema);
