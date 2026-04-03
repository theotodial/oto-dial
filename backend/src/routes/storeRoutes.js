import express from "express";

const router = express.Router();

/**
 * GET /api/stores
 * Placeholder endpoint to keep frontend wired
 */
router.get("/", (_req, res) => {
  res.json({ success: true, stores: [] });
});

export default router;
