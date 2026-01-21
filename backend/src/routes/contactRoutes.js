import express from "express";

const router = express.Router();

/**
 * POST /api/contact
 * Contact form handler (NO nodemailer)
 */
router.post("/", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      businessCategory,
      businessDescription,
      serviceRequest,
      isUrgent
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: "Name and email are required"
      });
    }

    // Log submission (safe + traceable)
    console.log("📩 CONTACT FORM SUBMISSION:", {
      name,
      email,
      phone,
      businessCategory,
      businessDescription,
      serviceRequest,
      isUrgent,
      receivedAt: new Date().toISOString()
    });

    // Always return success (frontend-friendly)
    return res.json({
      success: true,
      message: "Thank you! Our team will contact you shortly."
    });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to submit contact form"
    });
  }
});

export default router;
