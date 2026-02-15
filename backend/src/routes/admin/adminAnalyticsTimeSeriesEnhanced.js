import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import TelnyxCost from "../../models/TelnyxCost.js";
import {
  syncPaidInvoicesFromStripe,
  getStripeRevenueByDayFromMongo
} from "../../services/stripeInvoiceSyncService.js";

const router = express.Router();

function getDateRange(filter) {
  const now = new Date();

  if (typeof filter === "string" && filter.startsWith("range:")) {
    const [, startRaw, endRaw] = filter.split(":");
    if (startRaw && endRaw) {
      return {
        startDate: new Date(startRaw),
        endDate: new Date(endRaw)
      };
    }
  }

  if (typeof filter === "string" && filter.endsWith("h")) {
    const hours = parseInt(filter.slice(0, -1), 10);
    if (!Number.isNaN(hours) && hours > 0) {
      return {
        startDate: new Date(now.getTime() - hours * 60 * 60 * 1000),
        endDate: now
      };
    }
  }

  if (typeof filter === "string" && filter.endsWith("d")) {
    const days = parseInt(filter.slice(0, -1), 10);
    if (!Number.isNaN(days) && days > 0) {
      return {
        startDate: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
        endDate: now
      };
    }
  }

  switch (filter) {
    case "1h":
      return { startDate: new Date(now.getTime() - 1 * 60 * 60 * 1000), endDate: now };
    case "4h":
      return { startDate: new Date(now.getTime() - 4 * 60 * 60 * 1000), endDate: now };
    case "24h":
      return { startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000), endDate: now };
    case "3d":
      return { startDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), endDate: now };
    case "7d":
      return { startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), endDate: now };
    case "30d":
      return { startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), endDate: now };
    case "60d":
      return { startDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), endDate: now };
    case "90d":
      return { startDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), endDate: now };
    case "all":
      return { startDate: new Date(0), endDate: now };
    default:
      return { startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), endDate: now };
  }
}

function buildDays(startDate, endDate) {
  const days = [];
  const currentDate = new Date(startDate);
  const endDateObj = new Date(endDate);
  currentDate.setHours(0, 0, 0, 0);
  endDateObj.setHours(23, 59, 59, 999);

  while (currentDate <= endDateObj) {
    days.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return days;
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { filter = "30d" } = req.query;
    const { startDate, endDate } = getDateRange(filter);
    const days = buildDays(startDate, endDate);

    const dailyDataMap = new Map();
    days.forEach((day) => {
      const dayKey = day.toISOString().split("T")[0];
      dailyDataMap.set(dayKey, {
        date: dayKey,
        revenue: 0,
        stripeFees: 0,
        refunds: 0,
        netRevenue: 0,
        telnyxCallCost: 0,
        telnyxSmsCost: 0,
        telnyxNumberCost: 0,
        totalTelnyxCost: 0,
        profit: 0,
        calls: 0,
        callMinutes: 0,
        sms: 0,
        failedCalls: 0,
        failedSms: 0
      });
    });

    const [calls, smsList] = await Promise.all([
      Call.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean(),
      SMS.find({ createdAt: { $gte: startDate, $lte: endDate } }).lean()
    ]);

    calls.forEach((call) => {
      const dayKey = new Date(call.createdAt).toISOString().split("T")[0];
      const dayData = dailyDataMap.get(dayKey);
      if (!dayData) return;
      dayData.calls += 1;
      if (call.billedMinutes) {
        dayData.callMinutes += call.billedMinutes;
      } else if (call.durationSeconds) {
        dayData.callMinutes += call.durationSeconds / 60;
      }
      if (call.status === "failed" || call.status === "missed") {
        dayData.failedCalls += 1;
      }
    });

    smsList.forEach((sms) => {
      const dayKey = new Date(sms.createdAt).toISOString().split("T")[0];
      const dayData = dailyDataMap.get(dayKey);
      if (!dayData) return;
      dayData.sms += 1;
      if (sms.status === "failed") {
        dayData.failedSms += 1;
      }
    });

    // Telnyx immutable ledger by day (call/sms/number).
    const telnyxCostsByDay = await TelnyxCost.aggregate([
      {
        $match: {
          eventTimestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$eventTimestamp" } },
            resourceType: "$resourceType"
          },
          total: { $sum: "$totalCostUsd" }
        }
      }
    ]);

    telnyxCostsByDay.forEach((row) => {
      const dayKey = row._id.day;
      const resourceType = row._id.resourceType;
      const amount = Number(row.total || 0);
      const dayData = dailyDataMap.get(dayKey);
      if (!dayData) return;

      if (resourceType === "call") {
        dayData.telnyxCallCost += amount;
      } else if (resourceType === "sms") {
        dayData.telnyxSmsCost += amount;
      } else if (resourceType === "number") {
        dayData.telnyxNumberCost += amount;
      }
    });

    // Fallback for number costs when ledger rows do not exist.
    const hasNumberCosts = telnyxCostsByDay.some((row) => row._id.resourceType === "number");
    if (!hasNumberCosts) {
      const activeNumbers = await PhoneNumber.find({ status: "active" }).lean();
      const totalMonthlyCost = activeNumbers.reduce((sum, num) => sum + (num.monthlyCost || 0), 0);
      const dailyNumberCost = totalMonthlyCost / 30;

      dailyDataMap.forEach((dayData) => {
        dayData.telnyxNumberCost += dailyNumberCost;
      });
    }

    // Sync and aggregate Stripe revenue from Mongo ledger.
    let stripeSync = { skipped: true, synced: 0, scanned: 0, pages: 0 };
    try {
      stripeSync = await syncPaidInvoicesFromStripe({
        startDate,
        endDate,
        maxPages: filter === "all" ? 20 : 6
      });
    } catch (syncErr) {
      console.warn("Stripe invoice sync warning:", syncErr.message);
    }

    const revenueByDay = await getStripeRevenueByDayFromMongo({
      startDate,
      endDate
    });

    revenueByDay.forEach((row) => {
      const dayKey = row._id;
      const dayData = dailyDataMap.get(dayKey);
      if (!dayData) return;
      dayData.revenue += Number(row.revenue || 0);
      const invoiceCount = Number(row.invoiceCount || 0);
      dayData.stripeFees += (dayData.revenue * 0.029) + (invoiceCount * 0.30);
    });

    const timeSeriesData = Array.from(dailyDataMap.values())
      .map((day) => {
        day.netRevenue = day.revenue - day.stripeFees - day.refunds;
        day.totalTelnyxCost = day.telnyxCallCost + day.telnyxSmsCost + day.telnyxNumberCost;
        day.profit = day.netRevenue - day.totalTelnyxCost;
        return {
          ...day,
          revenue: parseFloat(day.revenue.toFixed(2)),
          stripeFees: parseFloat(day.stripeFees.toFixed(2)),
          refunds: parseFloat(day.refunds.toFixed(2)),
          netRevenue: parseFloat(day.netRevenue.toFixed(2)),
          telnyxCallCost: parseFloat(day.telnyxCallCost.toFixed(4)),
          telnyxSmsCost: parseFloat(day.telnyxSmsCost.toFixed(4)),
          telnyxNumberCost: parseFloat(day.telnyxNumberCost.toFixed(4)),
          totalTelnyxCost: parseFloat(day.totalTelnyxCost.toFixed(4)),
          profit: parseFloat(day.profit.toFixed(2)),
          callMinutes: parseFloat(day.callMinutes.toFixed(2))
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      filter,
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      stripeSync,
      data: timeSeriesData
    });
  } catch (err) {
    console.error("Enhanced time-series analytics error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch enhanced time-series data"
    });
  }
});

export default router;
