import express from "express";

const router = express.Router();

router.post("/sms", async (req, res) => {
  const event = req.body?.data?.event_type;

  if (event !== "message.received") {
    return res.status(200).send("Ignored");
  }

  const payload = req.body.data.payload;

  const from = payload.from.phone_number;
  const to = payload.to[0].phone_number;
  const text = payload.text;

  console.log("📩 INBOUND SMS RECEIVED");
  console.log("From:", from);
  console.log("To:", to);
  console.log("Text:", text);

  // TODO: save to DB here (sms collection)

  res.status(200).send("OK");
});

export default router;
