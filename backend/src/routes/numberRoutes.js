import express from "express";

const router = express.Router();

/**
 * GET /api/numbers
 */
router.get("/", async (req, res) => {
  try {
    res.json({
      success: true,
      numbers: req.subscription ? req.subscription.numbers : []
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch numbers"
    });
  }
});

export default router;
