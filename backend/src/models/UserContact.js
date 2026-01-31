import mongoose from "mongoose";

const userContactSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    label: {
      type: String,
      default: "",
      trim: true
    }
  },
  { timestamps: true, versionKey: false }
);

// Fast lookup by user; duplicate phone numbers handled in API by normalized match
userContactSchema.index({ user: 1 });

export default mongoose.model("UserContact", userContactSchema);
