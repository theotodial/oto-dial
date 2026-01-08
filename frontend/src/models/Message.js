import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
  user_id: { type: Number, required: true },
  phone_number: { type: String, required: true },
  message: { type: String, required: true },
  sender: { type: String, enum: ["user", "contact"], required: true },
  created_at: { type: Date, default: Date.now }
});

export default mongoose.model("Message", MessageSchema);
