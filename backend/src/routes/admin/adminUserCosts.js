import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Subscription from "../../models/Subscription.js";
import Stripe from "stripe";

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/**
 * GET /api/admin/users/:id/costs
 * Get detailed cost breakdown for a user
 */
router.get("/:id/costs", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Get user's subscription
    const subscription = await Subscription.findOne({
      userId,
      status: "active"
    }).populate("planId");

    // Get user's phone numbers
    const phoneNumbers = await PhoneNumber.find({
      userId,
      status: "active"
    });

    // Calculate call costs
    const calls = await Call.find({ user: userId });
    let totalCallCost = 0;
    let totalCallMinutes = 0;
    calls.forEach(call => {
      if (call.cost) totalCallCost += call.cost;
      if (call.billedMinutes) totalCallMinutes += call.billedMinutes;
    });

    // Calculate SMS costs
    const smsList = await SMS.find({ user: userId });
    let totalSmsCost = 0;
    smsList.forEach(sms => {
      if (sms.cost) totalSmsCost += sms.cost;
    });

    // Calculate phone number costs
    let totalMonthlyNumberCost = 0;
    let totalOneTimeNumberCost = 0;
    phoneNumbers.forEach(num => {
      if (num.monthlyCost) totalMonthlyNumberCost += num.monthlyCost;
      if (num.oneTimeFees) totalOneTimeNumberCost += num.oneTimeFees;
    });

    // Calculate total Telnyx cost
    const totalTelnyxCost = totalCallCost + totalSmsCost + totalMonthlyNumberCost + totalOneTimeNumberCost;

    // Get Stripe revenue for this user
    let totalRevenue = 0;
    if (stripe && subscription) {
      try {
        const customerId = subscription.userId?.toString();
        // Try to find Stripe customer ID from user
        const invoices = await stripe.invoices.list({
          limit: 100,
          status: "paid"
        });

        // Match invoices to user (this is approximate - ideally store Stripe customer ID)
        // For now, we'll use subscription data
        invoices.data.forEach(invoice => {
          // This is a simplified match - in production, link Stripe customer ID to user
          if (invoice.customer) {
            // Would need to match via stored Stripe customer ID
          }
        });
      } catch (stripeErr) {
        console.warn("Stripe revenue calculation error:", stripeErr.message);
      }
    }

    // Calculate profit/loss
    const netProfit = totalRevenue - totalTelnyxCost;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    res.json({
      success: true,
      costs: {
        calls: {
          totalCost: parseFloat(totalCallCost.toFixed(4)),
          totalMinutes: parseFloat(totalCallMinutes.toFixed(2)),
          count: calls.length
        },
        sms: {
          totalCost: parseFloat(totalSmsCost.toFixed(4)),
          count: smsList.length
        },
        phoneNumbers: {
          monthlyCost: parseFloat(totalMonthlyNumberCost.toFixed(2)),
          oneTimeCost: parseFloat(totalOneTimeNumberCost.toFixed(2)),
          count: phoneNumbers.length
        },
        totalTelnyxCost: parseFloat(totalTelnyxCost.toFixed(4)),
        revenue: parseFloat(totalRevenue.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(4)),
        profitMargin: parseFloat(profitMargin.toFixed(2))
      }
    });
  } catch (err) {
    console.error("User costs error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch user costs"
    });
  }
});

export default router;
