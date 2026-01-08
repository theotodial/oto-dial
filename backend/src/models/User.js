import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true
    },

    password: {
      type: String,
      required: true
    },

    firstName: {
      type: String,
      default: ""
    },

    lastName: {
      type: String,
      default: ""
    },

    name: {
      type: String,
      default: ""
    },

    phone: {
      type: String,
      default: ""
    },

    company: {
      type: String,
      default: ""
    },

    // 👇 ADD THIS
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    // 👇 ADD THIS
    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active"
    },

    stripeCustomerId: { 
      type: String 
    },

    subscriptionActive: { 
      type: Boolean, 
      default: false
     },
     
    plan: { 
      type: String, 
      default: null
     },

    telnyxNumber: {
      type: String,
      default: null
    },

    minutesUsed: {
      type: Number,
      default: 0
    },

    smsUsed: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);

