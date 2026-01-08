import mongoose from "mongoose";

const NumberSchema = new mongoose.Schema({
  user_id: { type: Number, required: true },
  number: { type: String, required: true },
  telnyx_number_id: { type: String, required: true }
});

export default mongoose.model("Number", NumberSchema);
