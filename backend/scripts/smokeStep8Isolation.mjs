import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import connectDB from "../config/db.js";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import PhoneNumber from "../src/models/PhoneNumber.js";
import SMS from "../src/models/SMS.js";

dotenv.config();

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";

function mkE164(seed) {
  const s = String(seed).replace(/\D/g, "").slice(-10).padStart(10, "7");
  return `+1${s}`;
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function getWithToken(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function main() {
  await connectDB();

  const runId = `smoke-${Date.now()}`;
  const userAEmail = `${runId}-a@otodial.com`;
  const userBEmail = `${runId}-b@otodial.com`;

  const userA = await User.create({
    email: userAEmail,
    password: "smoke-test-password",
    status: "active",
    firstName: "SmokeA",
    lastName: "Isolation",
  });
  const userB = await User.create({
    email: userBEmail,
    password: "smoke-test-password",
    status: "active",
    firstName: "SmokeB",
    lastName: "Isolation",
  });

  const ownedA = mkE164(`${Date.now()}01`);
  const ownedB = mkE164(`${Date.now()}02`);
  const external = mkE164(`${Date.now()}33`);

  await PhoneNumber.create({
    userId: userA._id,
    phoneNumber: ownedA,
    status: "active",
    telnyxPhoneNumberId: `${runId}-pn-a`,
  });
  await PhoneNumber.create({
    userId: userB._id,
    phoneNumber: ownedB,
    status: "active",
    telnyxPhoneNumberId: `${runId}-pn-b`,
  });

  const inboundA = await postJson("/api/webhooks/telnyx/sms", {
    data: {
      event_type: "message.received",
      payload: {
        id: `${runId}-in-a`,
        to: [{ phone_number: ownedA }],
        from: { phone_number: external },
        text: `A inbound ${runId}`,
      },
    },
  });
  const inboundB = await postJson("/api/webhooks/telnyx/sms", {
    data: {
      event_type: "message.received",
      payload: {
        id: `${runId}-in-b`,
        to: [{ phone_number: ownedB }],
        from: { phone_number: external },
        text: `B inbound ${runId}`,
      },
    },
  });

  await new Promise((r) => setTimeout(r, 1200));

  const smsA = await SMS.findOne({
    user: userA._id,
    telnyxMessageId: `${runId}-in-a`,
  })
    .lean()
    .exec();
  const smsB = await SMS.findOne({
    user: userB._id,
    telnyxMessageId: `${runId}-in-b`,
  })
    .lean()
    .exec();

  const tokenA = jwt.sign({ userId: String(userA._id) }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const tokenB = jwt.sign({ userId: String(userB._id) }, process.env.JWT_SECRET, { expiresIn: "1h" });

  const threadA = smsA?.threadKey || "";
  const threadB = smsB?.threadKey || "";

  const aOwnThread = await getWithToken(`/api/messages?thread=${encodeURIComponent(threadA)}`, tokenA);
  const bOwnThread = await getWithToken(`/api/messages?thread=${encodeURIComponent(threadB)}`, tokenB);
  const bReadsAThread = await getWithToken(`/api/messages?thread=${encodeURIComponent(threadA)}`, tokenB);
  const aReadsBThread = await getWithToken(`/api/messages?thread=${encodeURIComponent(threadB)}`, tokenA);

  const callProbe = await postJson("/api/webhooks/telnyx/voice", {
    data: {
      event_type: "call.initiated",
      payload: {
        call_control_id: `${runId}-cc-1`,
        call_session_id: `${runId}-cs-1`,
        direction: "incoming",
        from: ownedA,
        to: ownedB,
      },
    },
  });

  const pass = {
    test1_A_reply_isolated:
      inboundA.status === 200 &&
      Boolean(smsA) &&
      String(smsA.user) === String(userA._id) &&
      smsA.ownedNumber === ownedA &&
      smsA.externalNumber === external,
    test2_B_reply_isolated:
      inboundB.status === 200 &&
      Boolean(smsB) &&
      String(smsB.user) === String(userB._id) &&
      smsB.ownedNumber === ownedB &&
      smsB.externalNumber === external,
    test3_cross_account_hidden:
      (bReadsAThread.status === 403 ||
        (bReadsAThread.status === 200 && Array.isArray(bReadsAThread.body?.messages) && bReadsAThread.body.messages.length === 0)) &&
      (aReadsBThread.status === 403 ||
        (aReadsBThread.status === 200 && Array.isArray(aReadsBThread.body?.messages) && aReadsBThread.body.messages.length === 0)),
    test4_call_routing_trace_emitted: callProbe.status === 200,
  };

  const report = {
    runId,
    fixtures: {
      userAId: String(userA._id),
      userBId: String(userB._id),
      ownedA,
      ownedB,
      external,
      threadA,
      threadB,
    },
    http: {
      inboundA,
      inboundB,
      callProbe,
      aOwnThread,
      bOwnThread,
      bReadsAThread,
      aReadsBThread,
    },
    db: {
      smsA: smsA
        ? {
            id: String(smsA._id),
            user: String(smsA.user),
            ownedNumber: smsA.ownedNumber,
            externalNumber: smsA.externalNumber,
            threadKey: smsA.threadKey,
          }
        : null,
      smsB: smsB
        ? {
            id: String(smsB._id),
            user: String(smsB.user),
            ownedNumber: smsB.ownedNumber,
            externalNumber: smsB.externalNumber,
            threadKey: smsB.threadKey,
          }
        : null,
    },
    pass,
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[smokeStep8Isolation] failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
