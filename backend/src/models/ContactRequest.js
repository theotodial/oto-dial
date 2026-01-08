import mongoose from "mongoose";

const contactSchema = new mongoose.Schema({
  businessCategory: String,
  name: String,
  email: String,
  phone: String,
  businessDescription: String,
  serviceRequest: String,
  isUrgent: Boolean
}, { timestamps: true });

export default mongoose.model("ContactRequest", contactSchema);
