import express from "express";
import authenticateUser from "../../middleware/authenticateUser.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import TelnyxCost from "../../models/TelnyxCost.js";

const router = express.Router();

/**
 * DELETE /api/admin/users/:id
 * Permanently delete a user and all associated data (ADMIN ONLY)
 */
router.delete(
  "/:id",
  authenticateUser,
  async (req, res) => {
    try {
      // TODO: Add admin permission check
      const userId = req.params.id;

      if (!userId) {
        return res.status(400).json({ error: "User ID required" });
      }

      // Prevent self-deletion
      if (userId === req.user._id.toString()) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }

      // Find user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Delete all associated data
      await Promise.all([
        // Delete subscriptions
        Subscription.deleteMany({ userId }),
        // Delete phone numbers
        PhoneNumber.deleteMany({ userId }),
        // Delete calls
        Call.deleteMany({ user: userId }),
        // Delete SMS
        SMS.deleteMany({ user: userId }),
        // Delete cost records
        TelnyxCost.deleteMany({ userId }),
        // Delete user
        User.findByIdAndDelete(userId)
      ]);

      console.log(`✅ User ${userId} and all associated data deleted by admin ${req.user._id}`);

      res.json({
        success: true,
        message: "User and all associated data deleted permanently"
      });
    } catch (err) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  }
);

export default router;
