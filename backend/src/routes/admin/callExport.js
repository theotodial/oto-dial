import express from "express";

const router = express.Router();

/**
 * GET /api/admin/calls/export
 * TEMPORARILY DISABLED
 */
router.get("/calls/export", (req, res) => {
  return res.status(503).json({
    success: false,
    message: "CSV export is temporarily disabled"
  });
});

export default router;
