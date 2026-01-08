import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import PhoneNumber from "../models/PhoneNumber.js";

const router = express.Router();

router.get("/", authenticateUser, async (req, res) => {
  try {
    const numbers = await PhoneNumber.find({
      userId: req.userId,
      status: "active"
    });

    res.json({ success: true, numbers });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch numbers"
    });
  }
});

export default router;
