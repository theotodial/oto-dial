import express from "express";
import { Parser } from "json2csv";
import Call from "../../models/Call.js";

const router = express.Router();

router.get("/calls/export", async (req, res) => {
  try {
    const calls = await Call.find()
      .populate("user", "email")
      .sort({ createdAt: -1 });

    const fields = [
      "user.email",
      "phoneNumber",
      "status",
      "durationSeconds",
      "billedMinutes",
      "cost",
      "createdAt"
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(calls);

    res.header("Content-Type", "text/csv");
    res.attachment("call-usage.csv");
    return res.send(csv);
  } catch (err) {
    console.error("CSV EXPORT ERROR:", err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});

export default router;
