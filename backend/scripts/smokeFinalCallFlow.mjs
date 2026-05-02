import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../src/models/User.js";
import PhoneNumber from "../src/models/PhoneNumber.js";
import Call from "../src/models/Call.js";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";

function mkE164(seed) {
  const s = String(seed).replace(/\D/g, "").slice(-10).padStart(10, "8");
  return `+1${s}`;
}

async function postJson(path, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function getJson(path, token = null) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: "GET", headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function main() {
  await connectDB();
  const runId = `final-call-${Date.now()}`;

  const userA = await User.create({
    email: `${runId}-a@otodial.com`,
    password: "smoke-test-password",
    status: "active",
    role: "user",
  });
  const userB = await User.create({
    email: `${runId}-b@otodial.com`,
    password: "smoke-test-password",
    status: "active",
    role: "user",
  });
  const admin = await User.create({
    email: `${runId}-admin@otodial.com`,
    password: "smoke-test-password",
    status: "active",
    role: "admin",
    adminRoles: ["calls", "dashboard"],
  });

  const fromA = mkE164(`${Date.now()}31`);
  const toB = mkE164(`${Date.now()}32`);
  const external = mkE164(`${Date.now()}99`);

  await PhoneNumber.create({
    userId: userA._id,
    phoneNumber: fromA,
    status: "active",
    telnyxPhoneNumberId: `${runId}-pn-a`,
  });
  await PhoneNumber.create({
    userId: userB._id,
    phoneNumber: toB,
    status: "active",
    telnyxPhoneNumberId: `${runId}-pn-b`,
  });

  const adminToken = jwt.sign({ userId: String(admin._id) }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const cc = `${runId}-cc`;
  const cs = `${runId}-cs`;

  const initiated = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.initiated",
      payload: {
        call_control_id: cc,
        call_session_id: cs,
        direction: "incoming",
        from: fromA,
        to: toB,
        state: "new",
      },
    },
  });

  const ringing = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.ringing",
      payload: {
        call_control_id: cc,
        call_session_id: cs,
        direction: "incoming",
        from: fromA,
        to: toB,
        state: "ringing",
      },
    },
  });

  const answered = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.answered",
      payload: {
        call_control_id: cc,
        call_session_id: cs,
        direction: "incoming",
        from: fromA,
        to: toB,
        state: "active",
      },
    },
  });

  const bridged = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.bridged",
      payload: {
        call_control_id: cc,
        call_session_id: cs,
        direction: "incoming",
        from: fromA,
        to: toB,
        state: "bridged",
      },
    },
  });

  const playbackEnded = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.playback.ended",
      payload: {
        call_control_id: cc,
        call_session_id: cs,
        direction: "incoming",
        from: fromA,
        to: toB,
        state: "playback_end",
      },
    },
  });

  const machineEnded = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.machine.detection.ended",
      payload: {
        call_control_id: cc,
        call_session_id: cs,
        direction: "incoming",
        from: fromA,
        to: toB,
        state: "machine_detection_end",
      },
    },
  });

  const hangup = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.hangup",
      payload: {
        call_control_id: cc,
        call_session_id: cs,
        direction: "incoming",
        from: fromA,
        to: toB,
        state: "hangup",
        duration_seconds: 8,
        billable_time: 8,
        hangup_cause: "NORMAL_CLEARING",
      },
    },
  });

  await new Promise((r) => setTimeout(r, 1500));

  const callRow = await Call.findOne({ telnyxCallControlId: cc }).lean();
  const debugLive = await getJson("/api/admin/calls/debug/live", adminToken);
  const sipCheck = await getJson("/api/admin/calls/debug/sip-identities", adminToken);

  const eventTypes = (debugLive.body?.webhookEvents || [])
    .map((e) => e.eventType)
    .filter(Boolean);

  const pass = {
    initiated: initiated.status === 200 && Boolean(callRow?.callInitiatedAt),
    ringing: ringing.status === 200,
    answered: answered.status === 200 && Boolean(callRow?.callAnsweredAt || callRow?.callStartedAt),
    bridged: bridged.status === 200 && Boolean(callRow?.callBridgedAt),
    ended: hangup.status === 200 && Boolean(callRow?.callEndedAt),
    eventsLogged:
      eventTypes.includes("call.initiated") &&
      eventTypes.includes("call.answered") &&
      eventTypes.includes("call.bridged") &&
      eventTypes.includes("call.hangup") &&
      eventTypes.includes("call.machine.detection.ended") &&
      eventTypes.includes("call.playback.ended"),
    sipDiagnosticAvailable: sipCheck.status === 200 && sipCheck.body?.success === true,
  };

  const report = {
    runId,
    numbers: { fromA, toB, external },
    http: { initiated, ringing, answered, bridged, playbackEnded, machineEnded, hangup },
    callRow: callRow
      ? {
          id: String(callRow._id),
          user: String(callRow.user),
          status: callRow.status,
          fromNumber: callRow.fromNumber,
          toNumber: callRow.toNumber,
          initiatedAt: callRow.callInitiatedAt || null,
          answeredAt: callRow.callAnsweredAt || callRow.callStartedAt || null,
          bridgedAt: callRow.callBridgedAt || null,
          endedAt: callRow.callEndedAt || null,
          failReason: callRow.failReason || null,
          hangupCause: callRow.hangupCause || null,
        }
      : null,
    debugLive: {
      status: debugLive.status,
      recentEvents: (debugLive.body?.webhookEvents || []).slice(0, 20),
    },
    sipCheck: {
      status: sipCheck.status,
      summary: sipCheck.body?.summary || null,
      globalCredentials: sipCheck.body?.globalCredentials || null,
    },
    pass,
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[smokeFinalCallFlow] failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
