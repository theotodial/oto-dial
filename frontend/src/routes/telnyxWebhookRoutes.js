import express from "express";
import Message from "../models/Message.js";
import NumberModel from "../models/Number.js";

const router = express.Router();

router.post("/sms", async (req, res) => {
  const event = req.body?.data?.payload;

  if (!event?.text || !event?.from?.phone_number) {
    return res.sendStatus(200);
  }

  const toNumber = event.to.phone_number;
  const fromNumber = event.from.phone_number;

  const owner = await NumberModel.findOne({ number: toNumber });
  if (!owner) return res.sendStatus(200);

  await Message.create({
    user_id: owner.user_id,
    phone_number: fromNumber,
    message: event.text,
    sender: "contact"
  });

  res.sendStatus(200);
});

export default router;
