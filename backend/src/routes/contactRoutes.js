import express from "express";

const router = express.Router();

/**
 * POST /api/contact
 * TEMPORARILY DISABLED
 */
router.post("/", async (req, res) => {
  return res.status(503).json({
    success: false,
    message: "Contact form is temporarily disabled"
  });
});

export default router;
