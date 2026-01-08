import express from "express";
import nodemailer from "nodemailer";

const router = express.Router();

/**
 * POST /api/contact
 * Send contact form email to info@otodial.com
 */
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, businessCategory, businessDescription, serviceRequest, isUrgent } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // Create email transporter (configure with your email service)
    // For production, use proper SMTP configuration
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const emailContent = `
New Contact Form Submission${isUrgent ? " (URGENT)" : ""}

Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}

Business Category: ${businessCategory || "Not provided"}

Business Description:
${businessDescription || "Not provided"}

Service Request:
${serviceRequest || "Not provided"}

---
This email was sent from the OTO DIAL contact form.
    `.trim();

    // Send email
    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER || "noreply@otodial.com",
        to: "info@otodial.com",
        subject: `Contact Form: ${name}${isUrgent ? " (URGENT)" : ""}`,
        text: emailContent,
        html: emailContent.replace(/\n/g, "<br>"),
      });

      res.json({
        success: true,
        message: "Thank you! Our team will contact you shortly.",
      });
    } catch (emailError) {
      console.error("Email send error:", emailError);
      // Still return success to user, but log the error
      // In production, you might want to use a queue system
      res.json({
        success: true,
        message: "Thank you! Our team will contact you shortly.",
      });
    }
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to submit contact form" });
  }
});

export default router;
