import express from "express";
import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";

/**
 * Public catalog routes (no auth) — mounted before protected /api/subscription
 */
const router = express.Router();

router.get("/plans", async (req, res) => {
  try {
    const plans = await Plan.find({
      active: true,
      adminOnly: { $ne: true }
    })
      .sort({ price: 1 })
      .select("-__v");
    res.json({
      success: true,
      plans: plans.map((plan) => ({
        _id: plan._id,
        name: plan.name,
        planName: plan.planName || null,
        type: plan.type || null,
        displayUnlimited: Boolean(plan.displayUnlimited),
        price: plan.price,
        currency: plan.currency,
        limits: plan.limits,
        stripeProductId: plan.stripeProductId,
        stripePriceId: plan.stripePriceId,
      })),
    });
  } catch (err) {
    console.error("Fetch plans error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch plans",
    });
  }
});

router.get("/addons", async (req, res) => {
  try {
    const addons = await AddonPlan.find({ active: true }).sort({ price: 1 }).select("-__v");
    res.json({
      success: true,
      addons: addons.map((addon) => ({
        _id: addon._id,
        name: addon.name,
        type: addon.type,
        price: addon.price,
        currency: addon.currency,
        quantity: addon.quantity,
      })),
    });
  } catch (err) {
    console.error("Fetch addons error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch add-ons",
    });
  }
});

export default router;
