import express from "express";
import SMS from "../../models/SMS.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const payload = req.body?.data?.payload;
  if (!payload) return res.json({ received: true });

  await SMS.create({
    to: payload.to?.[0]?.phone_number,
    from: payload.from?.phone_number,
    text: payload.text,
    direction: "inbound"
  });

  res.json({ received: true });
});

export default router;
