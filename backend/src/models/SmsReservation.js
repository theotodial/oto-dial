import mongoose from "mongoose";

const smsReservationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      maxlength: 128,
    },
    reservedParts: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["reserved", "finalized", "released"],
      default: "reserved",
      index: true,
    },
  },
  { timestamps: true }
);

smsReservationSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, name: "userId_idempotencyKey_unique" }
);
smsReservationSchema.index({ userId: 1, status: 1, createdAt: -1 });

export default mongoose.model("SmsReservation", smsReservationSchema);
