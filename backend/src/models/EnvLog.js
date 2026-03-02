import mongoose from "mongoose";

const { Schema } = mongoose;

const EnvLogSchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    changes: { type: [Schema.Types.Mixed], default: [] },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

export default mongoose.model("EnvLog", EnvLogSchema);

