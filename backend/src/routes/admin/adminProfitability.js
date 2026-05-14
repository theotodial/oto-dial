import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import User from "../../models/User.js";
import {
  clearProfitabilityCache,
  calculateUserProfitability,
  calculateAllUsersProfitability,
  getProfitabilityCacheMeta,
} from "../../services/userProfitabilityEngine.js";

const router = express.Router();

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
}

/**
 * GET /api/admin/analytics/profitability/cache
 * In-memory profitability engine cache stats.
 */
router.get("/cache", requireAdmin, async (_req, res) => {
  try {
    res.json({
      success: true,
      cache: getProfitabilityCacheMeta(),
    });
  } catch (err) {
    console.error("[adminProfitability] cache meta error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to read cache meta" });
  }
});

/**
 * POST /api/admin/analytics/profitability/cache/refresh
 * Clears in-memory cache. Optional ?warm=1 recomputes all-user snapshot (expensive).
 * Optional query: startDate, endDate (ISO) when warm=1.
 */
router.post("/cache/refresh", requireAdmin, async (req, res) => {
  try {
    clearProfitabilityCache();
    const warm =
      String(req.query.warm || "").trim() === "1" ||
      req.body?.warm === true;
    let snapshotMeta = null;
    if (warm) {
      const snapshot = await calculateAllUsersProfitability({
        startDate: req.query.startDate || req.body?.startDate || null,
        endDate: req.query.endDate || req.body?.endDate || null,
        forceRefresh: true,
      });
      snapshotMeta = {
        userCount: Array.isArray(snapshot?.users) ? snapshot.users.length : 0,
        window: snapshot?.window || null,
        generatedAt: snapshot?.generatedAt || null,
      };
    }
    res.json({
      success: true,
      cache: getProfitabilityCacheMeta(),
      warmed: Boolean(warm),
      snapshotMeta,
    });
  } catch (err) {
    console.error("[adminProfitability] cache refresh error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to refresh cache" });
  }
});

/**
 * GET /api/admin/analytics/profitability/users/:userId
 * Per-user profitability snapshot for optional window (?startDate=&endDate= ISO).
 * ?force=1 bypasses per-user cache; ?emitEvent=1 writes a ProfitEvent row.
 */
router.get("/users/:userId", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) {
      return res.status(400).json({ success: false, error: "Invalid user id" });
    }
    const exists = await User.exists({ _id: uid });
    if (!exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const forceRefresh = String(req.query.force || "").trim() === "1";
    const emitEvent = String(req.query.emitEvent || "").trim() === "1";
    const metrics = await calculateUserProfitability({
      userId: uid,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      forceRefresh,
      emitEvent,
    });
    const user = await User.findById(uid)
      .select("email riskFlags riskOverrides")
      .lean();
    res.json({
      success: true,
      metrics,
      riskFlags: user?.riskFlags || null,
      riskOverrides: user?.riskOverrides || null,
      user: { id: String(uid), email: user?.email || null },
    });
  } catch (err) {
    console.error("[adminProfitability] user snapshot error:", err);
    const status = err?.message === "invalid_user_id" ? 400 : 500;
    res.status(status).json({
      success: false,
      error: err.message || "Failed to compute profitability snapshot",
    });
  }
});

/**
 * PATCH /api/admin/analytics/profitability/users/:userId/risk-overrides
 * Manual guardrail overrides (expire with expiresAt or clear all with { clear: true }).
 * Body fields (all optional except when clearing): reservationMultiplier (1–2 or null),
 * throttleDelayMs (0–3000 or null), maxConcurrentCalls (1–10 or null), expiresAt (ISO or null), note.
 */
router.patch("/users/:userId/risk-overrides", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) {
      return res.status(400).json({ success: false, error: "Invalid user id" });
    }
    const exists = await User.exists({ _id: uid });
    if (!exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const body = req.body || {};
    if (body.clear === true) {
      await User.updateOne({ _id: uid }, { $unset: { riskOverrides: 1 } });
      return res.json({ success: true, cleared: true });
    }

    const $set = {
      "riskOverrides.updatedAt": new Date(),
      "riskOverrides.updatedBy": req.user?._id || null,
    };

    if ("note" in body) {
      $set["riskOverrides.note"] = String(body.note || "").slice(0, 500);
    }
    if ("expiresAt" in body) {
      $set["riskOverrides.expiresAt"] = body.expiresAt ? new Date(body.expiresAt) : null;
    }

    if ("reservationMultiplier" in body) {
      if (body.reservationMultiplier === null) {
        $set["riskOverrides.reservationMultiplier"] = null;
      } else {
        const m = Number(body.reservationMultiplier);
        if (!Number.isFinite(m) || m < 1 || m > 2) {
          return res.status(400).json({
            success: false,
            error: "reservationMultiplier must be null or a number between 1 and 2",
          });
        }
        $set["riskOverrides.reservationMultiplier"] = m;
      }
    }

    if ("throttleDelayMs" in body) {
      if (body.throttleDelayMs === null) {
        $set["riskOverrides.throttleDelayMs"] = null;
      } else {
        const t = Number(body.throttleDelayMs);
        if (!Number.isFinite(t) || t < 0 || t > 3000) {
          return res.status(400).json({
            success: false,
            error: "throttleDelayMs must be null or a number between 0 and 3000",
          });
        }
        $set["riskOverrides.throttleDelayMs"] = Math.floor(t);
      }
    }

    if ("maxConcurrentCalls" in body) {
      if (body.maxConcurrentCalls === null) {
        $set["riskOverrides.maxConcurrentCalls"] = null;
      } else {
        const c = Number(body.maxConcurrentCalls);
        if (!Number.isFinite(c) || c < 1 || c > 10) {
          return res.status(400).json({
            success: false,
            error: "maxConcurrentCalls must be null or an integer between 1 and 10",
          });
        }
        $set["riskOverrides.maxConcurrentCalls"] = Math.floor(c);
      }
    }

    await User.updateOne({ _id: uid }, { $set });
    const updated = await User.findById(uid).select("riskOverrides riskFlags email").lean();
    res.json({
      success: true,
      riskOverrides: updated?.riskOverrides || null,
      riskFlags: updated?.riskFlags || null,
      user: { id: String(uid), email: updated?.email || null },
    });
  } catch (err) {
    console.error("[adminProfitability] risk-overrides error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to update risk overrides" });
  }
});

export default router;
