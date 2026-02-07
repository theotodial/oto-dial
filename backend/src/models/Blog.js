import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      index: true
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    excerpt: {
      type: String,
      default: ""
    },

    content: {
      type: String,
      required: true
    },

    featuredImage: {
      type: String,
      default: ""
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    authorName: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true
    },

    publishedAt: {
      type: Date,
      default: null,
      index: true
    },

    // SEO Fields
    metaTitle: {
      type: String,
      default: ""
    },

    metaDescription: {
      type: String,
      default: ""
    },

    metaKeywords: {
      type: [String],
      default: []
    },

    ogImage: {
      type: String,
      default: ""
    },

    // Categories and Tags
    category: {
      type: String,
      default: ""
    },

    tags: {
      type: [String],
      default: [],
      index: true
    },

    // AdSense Configuration
    adsenseEnabled: {
      type: Boolean,
      default: true
    },

    adsenseCode: {
      type: String,
      default: "" // Google AdSense ad unit code
    },

    // Reading time and stats
    readingTime: {
      type: Number,
      default: 0 // in minutes
    },

    views: {
      type: Number,
      default: 0
    },

    // Schema.org structured data
    structuredData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

// Generate slug from title before saving
blogSchema.pre("save", function(next) {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

// Calculate reading time before saving
blogSchema.pre("save", function(next) {
  if (this.isModified("content")) {
    const wordsPerMinute = 200;
    const text = this.content.replace(/<[^>]*>/g, ""); // Remove HTML tags
    const wordCount = text.split(/\s+/).length;
    this.readingTime = Math.ceil(wordCount / wordsPerMinute) || 1;
  }
  next();
});

export default mongoose.model("Blog", blogSchema);
