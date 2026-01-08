import express from "express";
import telnyx from "../lib/telnyx.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { from_number, to_number } = req.body;

  await telnyx.calls.create({
    from: from_number,
    to: to_number,
    connection_id: process.env.TELNYX_CONNECTION_ID
  });

  res.json({ success: true });
});

export default router;
