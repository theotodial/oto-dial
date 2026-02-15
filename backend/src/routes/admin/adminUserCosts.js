import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";
import StripeInvoice from "../../models/StripeInvoice.js";

const router = express.Router();

/**
 * GET /api/admin/users/:id/costs
 * Get detailed cost breakdown for a user
 */
router.get("/:id/costs", requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId).select("stripeCustomerId");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

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
    const invoiceFilter = {
      status: "paid",
      $or: [
        { userId },
        ...(user.stripeCustomerId ? [{ customerId: user.stripeCustomerId }] : [])
      ]
    };
    const userInvoices = await StripeInvoice.find(invoiceFilter).lean();
    const totalRevenue = userInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amountPaid || 0),
      0
    );
    const subscriptionRevenue = userInvoices
      .filter((invoice) => invoice.purchaseType === "subscription")
      .reduce((sum, invoice) => sum + Number(invoice.amountPaid || 0), 0);
    const addonRevenue = userInvoices
      .filter((invoice) => invoice.purchaseType === "addon")
      .reduce((sum, invoice) => sum + Number(invoice.amountPaid || 0), 0);

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
        subscriptionRevenue: parseFloat(subscriptionRevenue.toFixed(2)),
        addonRevenue: parseFloat(addonRevenue.toFixed(2)),
        paidInvoiceCount: userInvoices.length,
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
