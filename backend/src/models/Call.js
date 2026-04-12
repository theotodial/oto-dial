import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const callSchema = new mongoose.Schema(
  {
    telnyxCallControlId: {
      type: String,
      default: null
    },

    /** Same logical call across legs (Telnyx bridges multiple call_control_id values). */
    telnyxCallSessionId: {
      type: String,
      default: null,
      index: true,
    },

    /** Additional leg control IDs seen on webhooks (answered/hangup may not match primary). */
    telnyxLegControlIds: {
      type: [String],
      default: [],
    },

    /** Server-initiated hangup after outbound ring timeout (GET poll). */
    voiceRingTimeoutHangupSent: {
      type: Boolean,
      default: false,
    },

    /** Park-outbound WebRTC: server Dial from parked agent leg (see telnyxParkedOutboundService). */
    webrtcParkDialAttempted: {
      type: Boolean,
      default: false,
    },
    webrtcParkPstnCallControlId: {
      type: String,
      default: null,
    },
    webrtcParkBridgeAttempted: {
      type: Boolean,
      default: false,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    phoneNumber: {
      type: String,
      required: true
    },

    fromNumber: {
      type: String,
      default: null
    },

    toNumber: {
      type: String,
      default: null
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "outbound"
    },

    /** Outbound WebRTC (client SDK) vs legacy server-originated voice API */
    source: {
      type: String,
      enum: ["webrtc", "voice_api"],
      default: "webrtc",
    },

    status: {
      type: String,
      enum: [
        "queued",
        "initiated",
        "dialing",
        "ringing",
        "in-progress",
        "answered",
        "completed",
        "failed",
        "missed",
      ],
      default: "initiated",
    },

    callInitiatedAt: {
      type: Date,
      default: null
    },

    callStartedAt: {
      type: Date,
      default: null
    },

    callEndedAt: {
      type: Date,
      default: null
    },

    durationSeconds: {
      type: Number,
      default: 0
    },

    hangupCause: {
      type: String,
      default: null
    },

    hangupCauseCode: {
      type: String,
      default: null
    },

    cost: {
      type: Number,
      default: 0
    },
    
    billedMinutes: {
      type: Number,
      default: 0
    },

    // Enhanced cost tracking
    costPerSecond: {
      type: Number,
      default: 0
    },

    ringingDuration: {
      type: Number,
      default: 0 // seconds
    },

    answeredDuration: {
      type: Number,
      default: 0 // seconds
    },

    telnyxCallId: {
      type: String,
      default: null
    },

    // Cost sync tracking
    billedSeconds: {
      type: Number,
      default: 0
    },

    usageCountedAt: {
      type: Date,
      default: null
    },

    usageCountedSeconds: {
      type: Number,
      default: 0
    },

    carrierFee: {
      type: Number,
      default: 0
    },

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
  {
    timestamps: true,
    versionKey: false
  }
);

callSchema.index({ user: 1, createdAt: -1 });
callSchema.plugin(mongoPerformancePlugin, { label: "calls" });

export default mongoose.model("Call", callSchema);
