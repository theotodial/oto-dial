import mongoose from "mongoose";

const { Schema } = mongoose;

const SeoSettingsSchema = new Schema(
  {
    siteKey: { type: String, default: "default", unique: true, index: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    keywords: { type: [String], default: [] },
    hiddenKeywords: { type: [String], default: [] },
    schema: { type: Schema.Types.Mixed, default: {} },
    analyticsCache: { type: Schema.Types.Mixed, default: {} },
    robotsTxt: { type: String, default: "" },
    redirects: { type: [Schema.Types.Mixed], default: [] }
  },
  { timestamps: true }
);

export default mongoose.model("SeoSettings", SeoSettingsSchema);

