import express from "express";

const router = express.Router();

/**
 * GET /api/users/profile
 */
router.get("/me", async (req, res) => {
  try {
    const subscription = req.subscription;

    return res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role
      },
      subscription: subscription
        ? {
            active: true,
            plan: "monthly",
            minutesRemaining: subscription.minutesRemaining,
            smsRemaining: subscription.smsRemaining,
            number: subscription.numbers.length
              ? subscription.numbers[0].phoneNumber
              : null
          }
        : {
            active: false
          }
    });
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ success: false });
  }
});


export default router;
