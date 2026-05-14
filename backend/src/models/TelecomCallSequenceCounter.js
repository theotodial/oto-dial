import mongoose from "mongoose";

/** Atomic per-call sequence counter for TelecomEventSequence.sequenceNumber. */
const schema = new mongoose.Schema(
  {
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      unique: true,
      index: true,
    },
    seq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("TelecomCallSequenceCounter", schema);
