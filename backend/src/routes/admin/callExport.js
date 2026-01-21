import express from "express";
import Call from "../../models/Call.js";

const router = express.Router();

/**
 * GET /api/admin/calls/export
 * Export calls as CSV (NO external dependencies)
 */
router.get("/calls/export", async (req, res) => {
  try {
    const calls = await Call.find()
      .populate("user", "email")
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      "user_email",
      "phoneNumber",
      "status",
      "durationSeconds",
      "billedMinutes",
      "cost",
      "createdAt"
    ];

    const csvRows = [];
    csvRows.push(headers.join(","));

    for (const call of calls) {
      const row = [
        call.user?.email || "",
        call.phoneNumber || "",
        call.status || "",
        call.durationSeconds || 0,
        call.billedMinutes || 0,
        call.cost || 0,
        call.createdAt ? new Date(call.createdAt).toISOString() : ""
      ];

      csvRows.push(
        row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")
      );
    }

    const csv = csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=call-usage.csv");

    return res.send(csv);
  } catch (err) {
    console.error("CSV EXPORT ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Failed to export CSV"
    });
  }
});

export default router;
