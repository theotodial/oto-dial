import mongoose from "mongoose";

const TIMELINE_STATES = [
  "initialized",
  "reserved",
  "charging",
  "settled",
  "released",
  "finalized",
  "errored",
];

const economicTimelineSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      unique: true,
      index: true,
    },
    smsId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SMS",
      default: null,
    },
    timelineId: {
      type: String,
      required: true,
      unique: true,
      maxlength: 120,
      index: true,
    },
    economicVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    timelineState: {
      type: String,
      enum: TIMELINE_STATES,
      default: "initialized",
      index: true,
    },
    /** Credits logically reserved against this call on the timeline (mirrors min-reserve semantics). */
    reservedCredits: { type: Number, default: 0 },
    /** Sum of attempt + interval debits attributed to this call on the timeline. */
    consumedCredits: { type: Number, default: 0 },
    /** Reservation released back to pool (unused). */
    releasedCredits: { type: Number, default: 0 },
    /** Credits moved from reserved → consumed via settlement ledger rows. */
    settledCredits: { type: Number, default: 0 },
    /** 1-based interval indices successfully billed (deterministic dedupe). */
    billedIntervalIndexes: {
      type: [Number],
      default: [],
    },
    lastEconomicEventAt: {
      type: Date,
      default: null,
      index: true,
    },
    finalizedAt: {
      type: Date,
      default: null,
      index: true,
    },
    consistencyHash: {
      type: String,
      default: "",
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { versionKey: false }
);

economicTimelineSchema.index({ user: 1, lastEconomicEventAt: -1 });

export const ECONOMIC_TIMELINE_STATES = TIMELINE_STATES;
export default mongoose.model("EconomicTimeline", economicTimelineSchema);
