import mongoose from "mongoose";

const messageReadStateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true
    },
    lastReadAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true, versionKey: false }
);

messageReadStateSchema.index({ user: 1, phoneNumber: 1 }, { unique: true });

export default mongoose.model("MessageReadState", messageReadStateSchema);
