import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import loadSubscription from "../middleware/loadSubscription.js";

const router = express.Router();

/**
 * GET /api/numbers
 */
router.get(
  "/",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
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
  }
);

export default router;
