import mongoose from "mongoose";

const { Schema } = mongoose;

const SiteBuilderSchema = new Schema(
  {
    siteKey: { type: String, default: "default", unique: true, index: true },
    sections: { type: [Schema.Types.Mixed], default: [] },
    themeSettings: { type: Schema.Types.Mixed, default: {} },
    headerConfig: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("SiteBuilder", SiteBuilderSchema);

