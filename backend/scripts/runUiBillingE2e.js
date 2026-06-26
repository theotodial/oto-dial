/**
 * UI-facing billing E2E (API contract the frontend consumes).
 *
 * Usage: node scripts/runUiBillingE2e.js
 * Requires backend on PORT (default 5000) and Mongo from .env.
 */

import "../loadEnv.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../src/models/User.js";
import Subscription from "../src/models/Subscription.js";
import { PRIMARY_ADMIN_EMAIL } from "../src/constants/adminAccess.js";

const BASE = `http://127.0.0.1:${process.env.PORT || 5000}`;
const FRONTEND =
  process.env.LOCAL_FRONTEND_URL ||
  (process.env.LOCAL_UI_E2E === "1" ? "http://localhost:3000" : null) ||
  process.env.FRONTEND_URL ||
  "http://127.0.0.1:3000";
const results = [];

function pass(name, detail, data = {}) {
  results.push({ name, pass: true, detail, ...data });
}

function fail(name, detail, data = {}) {
  results.push({ name, pass: false, detail, ...data });
}

async function api(path, { token, method = "GET", body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: null, error: String(err) };
  }
}

function mintUserToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function findActiveSubscriber() {
  const sub = await Subscription.findOne({ status: "active" })
    .sort({ updatedAt: -1 })
    .select("userId remainingCredits telecomCredits reservedCredits")
    .lean();
  if (!sub?.userId) return null;
  const user = await User.findById(sub.userId).select("email name").lean();
  return { sub, user };
}

async function run() {
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET required");
    process.exit(1);
  }

  await connectDB();

  // Frontend dev server
  try {
    const fe = await fetch(FRONTEND, { method: "GET" });
    const html = await fe.text();
    const ok = fe.ok && html.includes("root");
    (ok ? pass : fail)("frontend", `dev server ${FRONTEND}`, { status: fe.status });
  } catch (err) {
    fail("frontend", `not reachable at ${FRONTEND}`, { error: String(err) });
  }

  // Backend health
  const health = await api("/api/health").catch(() => ({ ok: false }));
  if (health.ok || health.status === 200) {
    pass("backend", `API ${BASE}`);
  } else {
    fail("backend", `health check failed`, { status: health.status });
  }

  const fixture = await findActiveSubscriber();
  if (!fixture?.user) {
    fail("subscriber", "no active subscription user in DB");
  } else {
    const token = mintUserToken(fixture.user._id);
    const subRemaining = Number(fixture.sub.remainingCredits ?? fixture.sub.telecomCredits ?? 0);

    const wallet = await api("/api/wallet", { token });
    if (wallet.ok && wallet.data?.success) {
      const w = wallet.data;
      const ok =
        w.authority === "subscription" &&
        Number(w.remainingCredits) === subRemaining &&
        Number.isFinite(Number(w.projectedAvailableCredits));
      (ok ? pass : fail)("wallet", "subscription authority + projected balance", {
        remainingCredits: w.remainingCredits,
        projectedAvailableCredits: w.projectedAvailableCredits,
        authority: w.authority,
      });
    } else {
      fail("wallet", "GET /api/wallet failed", { status: wallet.status, data: wallet.data });
    }

    let bootstrap = await api("/api/app/bootstrap", { token });
    if (!bootstrap.ok && bootstrap.status === 401) {
      bootstrap = await api("/api/app/bootstrap", { token });
    }
    if (bootstrap.ok && bootstrap.data?.usage) {
      const u = bootstrap.data.usage;
      const creditsOk =
        Number.isFinite(Number(u.creditsRemaining)) &&
        Number(u.creditsRemaining) === subRemaining;
      const hasTelecomFields =
        "telecomCredits" in u && "reservedCredits" in u && "creditsLimit" in u;
      (creditsOk && hasTelecomFields ? pass : fail)("bootstrap", "usage.creditsRemaining matches subscription", {
        subscriptionRemaining: subRemaining,
        usage: {
          creditsRemaining: u.creditsRemaining,
          telecomCredits: u.telecomCredits,
          reservedCredits: u.reservedCredits,
          creditsLimit: u.creditsLimit,
          minutesRemaining: u.minutesRemaining,
        },
      });
    } else {
      fail("bootstrap", "GET /api/app/bootstrap failed", { status: bootstrap.status });
    }

    const projected = await api("/api/subscription/projected-balance", { token });
    if (projected.ok) {
      pass("projected-balance", "Recents/Billing dial guard endpoint", {
        projectedAvailableCredits: projected.data?.projectedAvailableCredits,
      });
    } else {
      fail("projected-balance", "GET /api/subscription/projected-balance failed", {
        status: projected.status,
      });
    }

    // Frontend proxy (if frontend up)
    try {
      const proxied = await fetch(`${FRONTEND}/api/app/bootstrap`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const proxiedData = await proxied.json().catch(() => ({}));
      const credits = proxiedData?.usage?.creditsRemaining;
      (proxied.ok && credits != null
        ? pass
        : fail)("vite-proxy", "/api proxied through local frontend", {
        creditsRemaining: credits,
        status: proxied.status,
        frontend: FRONTEND,
      });
    } catch (err) {
      fail("vite-proxy", "frontend proxy not available", { error: String(err) });
    }
  }

  // Admin users list credits
  const adminLogin = await api("/api/admin/auth/login", {
    method: "POST",
    body: { email: PRIMARY_ADMIN_EMAIL, password: "otodialteam" },
  });
  if (adminLogin.ok && adminLogin.data?.token) {
    const adminToken = adminLogin.data.token;
    const users = await api("/api/admin/users?limit=5", { token: adminToken });
    if (users.ok && Array.isArray(users.data?.users)) {
      const withCredits = users.data.users.filter(
        (u) => u?.credits && Number.isFinite(Number(u.credits.remainingCredits))
      );
      (withCredits.length > 0 ? pass : fail)("admin-users", "list exposes subscription credits", {
        sample: withCredits.slice(0, 2).map((u) => ({
          email: u.email,
          remainingCredits: u.credits?.remainingCredits,
        })),
      });
    } else {
      fail("admin-users", "GET /api/admin/users failed", { status: users.status });
    }
  } else {
    fail("admin-login", "admin auth (use primary admin in dev)", {
      status: adminLogin.status,
      hint: "Set admin password or use PRIMARY_ADMIN_EMAIL login",
    });
  }

  await mongoose.disconnect().catch(() => {});

  const summary = {
    ranAt: new Date().toISOString(),
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("[ui-billing-e2e] fatal", err);
  process.exit(1);
});
