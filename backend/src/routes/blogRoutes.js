import express from "express";
import Blog from "../models/Blog.js";
import User from "../models/User.js";
import authenticateUser from "../middleware/authenticateUser.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

// Public routes - Get all published blogs
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, category, tag, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { status: "published" };

    if (category) {
      query.category = category;
    }

    if (tag) {
      query.tags = tag;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } }
      ];
    }

    const blogs = await Blog.find(query)
      .populate("author", "name email")
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("-content"); // Don't send full content in listing

    const total = await Blog.countDocuments(query);

    res.json({
      success: true,
      blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({ success: false, error: "Failed to fetch blogs" });
  }
});

// Public route - Get single blog by slug
router.get("/:slug", async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug, status: "published" })
      .populate("author", "name email");

    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }

    // Increment views
    blog.views += 1;
    await blog.save();

    res.json({ success: true, blog });
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ success: false, error: "Failed to fetch blog" });
  }
});

// Admin routes - Get all blogs (including drafts)
router.get("/admin/all", authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } }
      ];
    }

    const blogs = await Blog.find(query)
      .populate("author", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Blog.countDocuments(query);

    res.json({
      success: true,
      blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({ success: false, error: "Failed to fetch blogs" });
  }
});

// Admin route - Get single blog by ID
router.get("/admin/:id", authenticateUser, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate("author", "name email");

    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }

    res.json({ success: true, blog });
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ success: false, error: "Failed to fetch blog" });
  }
});

// Admin route - Create blog
router.post("/admin", authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log("Blog create request received");
    console.log("Request body:", { 
      title: req.body.title, 
      slug: req.body.slug,
      hasContent: !!req.body.content,
      status: req.body.status 
    });
    const {
      title,
      slug,
      excerpt,
      content,
      featuredImage,
      status,
      metaTitle,
      metaDescription,
      metaKeywords,
      ogImage,
      category,
      tags,
      adsenseEnabled,
      adsenseCode
    } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Title is required" });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: "Content is required" });
    }

    // Check if content is just empty HTML tags
    const textContent = content.replace(/<[^>]*>/g, '').trim();
    if (!textContent) {
      return res.status(400).json({ success: false, error: "Content cannot be empty" });
    }

    // Generate slug if not provided
    let finalSlug = slug;
    if (!finalSlug || !finalSlug.trim()) {
      if (title) {
        finalSlug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
      } else {
        return res.status(400).json({ success: false, error: "Slug is required" });
      }
    }

    // Check if slug already exists
    const existingBlog = await Blog.findOne({ slug: finalSlug });
    if (existingBlog) {
      return res.status(400).json({ success: false, error: "Slug already exists" });
    }

    // Get user info for authorName (req.user is set by authenticateUser middleware)
    const authorName = req.user?.name || req.user?.email || "Admin";

    const blog = new Blog({
      title,
      slug: finalSlug,
      excerpt,
      content,
      featuredImage,
      author: req.userId,
      authorName: authorName,
      status: status || "draft",
      publishedAt: status === "published" ? new Date() : null,
      metaTitle,
      metaDescription,
      metaKeywords: Array.isArray(metaKeywords) ? metaKeywords : [],
      ogImage,
      category,
      tags: Array.isArray(tags) ? tags : [],
      adsenseEnabled: adsenseEnabled !== false,
      adsenseCode
    });

    await blog.save();

    console.log("Blog created successfully:", blog._id);
    res.status(201).json({ success: true, blog });
  } catch (error) {
    console.error("Error creating blog:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to create blog",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin route - Update blog
router.put("/admin/:id", authenticateUser, requireAdmin, async (req, res) => {
  try {
    console.log("Blog update request received for ID:", req.params.id);
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }

    const {
      title,
      slug,
      excerpt,
      content,
      featuredImage,
      status,
      metaTitle,
      metaDescription,
      metaKeywords,
      ogImage,
      category,
      tags,
      adsenseEnabled,
      adsenseCode
    } = req.body;

    // Validate required fields
    if (title !== undefined && (!title || !title.trim())) {
      return res.status(400).json({ success: false, error: "Title cannot be empty" });
    }

    if (content !== undefined) {
      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, error: "Content cannot be empty" });
      }
      // Check if content is just empty HTML tags
      const textContent = content.replace(/<[^>]*>/g, '').trim();
      if (!textContent) {
        return res.status(400).json({ success: false, error: "Content cannot be empty" });
      }
    }

    // Update fields
    if (title !== undefined) blog.title = title;
    if (slug !== undefined) blog.slug = slug;
    if (excerpt !== undefined) blog.excerpt = excerpt;
    if (content !== undefined) blog.content = content;
    if (featuredImage !== undefined) blog.featuredImage = featuredImage;
    if (metaTitle !== undefined) blog.metaTitle = metaTitle;
    if (metaDescription !== undefined) blog.metaDescription = metaDescription;
    if (metaKeywords !== undefined) blog.metaKeywords = Array.isArray(metaKeywords) ? metaKeywords : [];
    if (ogImage !== undefined) blog.ogImage = ogImage;
    if (category !== undefined) blog.category = category;
    if (tags !== undefined) blog.tags = Array.isArray(tags) ? tags : [];
    if (adsenseEnabled !== undefined) blog.adsenseEnabled = adsenseEnabled;
    if (adsenseCode !== undefined) blog.adsenseCode = adsenseCode;

    // Handle status change
    if (status !== undefined) {
      blog.status = status;
      if (status === "published" && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }
    }

    await blog.save();

    console.log("Blog updated successfully:", blog._id);
    res.json({ success: true, blog });
  } catch (error) {
    console.error("Error updating blog:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to update blog",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Admin route - Delete blog
router.delete("/admin/:id", authenticateUser, requireAdmin, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }

    await blog.deleteOne();

    res.json({ success: true, message: "Blog deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({ success: false, error: "Failed to delete blog" });
  }
});

// Public route - Get categories
router.get("/meta/categories", async (req, res) => {
  try {
    const categories = await Blog.distinct("category", { status: "published" });
    res.json({ success: true, categories: categories.filter(c => c) });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
});

// Public route - Get tags
router.get("/meta/tags", async (req, res) => {
  try {
    const tags = await Blog.distinct("tags", { status: "published" });
    const flatTags = [...new Set(tags.flat())];
    res.json({ success: true, tags: flatTags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    res.status(500).json({ success: false, error: "Failed to fetch tags" });
  }
});

export default router;
