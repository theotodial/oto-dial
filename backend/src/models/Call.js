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

    /** Immutable number ownership for inbound routing correctness. */
    ownedNumberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PhoneNumber",
      default: null,
      immutable: true,
      index: true,
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
        "answered",
        "in-progress",
        "completed",
        "failed",
        "canceled",
        "busy",
        "no-answer",
        "rejected",
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
    callAnsweredAt: {
      type: Date,
      default: null
    },
    callBridgedAt: {
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
    failReason: {
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
    },

    /** Client PATCH heartbeat while outbound WebRTC is in flight (server watchdog). */
    lastHeartbeatAt: {
      type: Date,
      default: null,
      index: true,
    },

    /** Latest Telnyx webhook `occurred_at` applied (ordering / stale-event hints). */
    telnyxLastWebhookAt: {
      type: Date,
      default: null,
    },

    /** Last accepted event timestamp regardless of source (ordering guard). */
    lastProcessedEventAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastEventSource: {
      type: String,
      default: null,
    },
    lastEventType: {
      type: String,
      default: null,
    },

    /** Last client state sync (WebRTC PATCH / websocket path). */
    lastClientSyncAt: {
      type: Date,
      default: null,
    },

    /** Last reconciliation pass and derived orphan reason classification. */
    lastReconciliationAt: {
      type: Date,
      default: null,
    },
    orphanRootCause: {
      type: String,
      enum: [
        "webhook_missing",
        "provider_timeout",
        "websocket_disconnect",
        "heartbeat_missing",
        "concurrency_race",
        "unknown",
      ],
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false
  }
);

callSchema.index({ user: 1, createdAt: -1 });
callSchema.index({ user: 1, phoneNumber: 1, createdAt: -1 });
callSchema.index({ user: 1, toNumber: 1, createdAt: -1 });
callSchema.index({ user: 1, fromNumber: 1, createdAt: -1 });
callSchema.index(
  { telnyxCallControlId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      telnyxCallControlId: { $exists: true, $type: "string", $ne: "" },
    },
  }
);

callSchema.pre("save", function callWriteDiscipline(next) {
  if (!this.isModified("status")) return next();
  // Hotfix: initial call creation is a trusted local write path and does not
  // run through transition helpers yet.
  if (this.isNew) return next();
  const source = this?.$locals?.transitionSource;
  const eventAt = this.lastProcessedEventAt;
  if (!source || !eventAt) {
    console.warn("[CALL WRITE GUARD] ordering_enforcement_bypass_blocked", {
      callId: this._id ? String(this._id) : null,
      status: this.status,
    });
    const err = new Error("ordering_enforcement_bypass_blocked");
    err.code = "ORDERING_ENFORCEMENT_BYPASS_BLOCKED";
    return next(err);
  }
  return next();
});
callSchema.plugin(mongoPerformancePlugin, { label: "calls" });

export default mongoose.model("Call", callSchema);
