import express from "express";
import Blog from "../models/Blog.js";
import authenticateUser from "../middleware/authenticateUser.js";
import requireAdmin from "../middleware/requireAdmin.js";
import { createAdminNotification } from "../services/adminNotificationService.js";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const router = express.Router();
const BLOG_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8MB

function getBackendHostname() {
  const backendUrl = String(process.env.BACKEND_URL || "").trim();
  if (!backendUrl) return null;
  try {
    return new URL(backendUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getPublicAssetUrl(relativePath) {
  const backendUrl = String(process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
  if (!backendUrl) return relativePath;

  try {
    const parsed = new URL(backendUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return relativePath;
    }
  } catch {
    return relativePath;
  }

  return `${backendUrl}${relativePath}`;
}

function normalizeUploadUrl(rawUrl, req) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return rawUrl;
  }

  const value = rawUrl.trim();
  if (!value) {
    return value;
  }

  if (value.startsWith("/api/uploads/")) {
    return value;
  }

  if (value.startsWith("/uploads/")) {
    return `/api${value}`;
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname || "";
    if (!pathname.startsWith("/uploads/") && !pathname.startsWith("/api/uploads/")) {
      return value;
    }

    const host = parsed.hostname.toLowerCase();
    const reqHost = String(req?.get?.("host") || "").toLowerCase().split(":")[0];
    const backendHost = getBackendHostname();
    const isInternalHost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    const isKnownHost = (backendHost && host === backendHost) || (reqHost && host === reqHost);

    if (isInternalHost || isKnownHost) {
      if (pathname.startsWith("/api/uploads/")) {
        return `${pathname}${parsed.search || ""}`;
      }
      return `/api${pathname}${parsed.search || ""}`;
    }

    return value;
  } catch {
    return value;
  }
}

function normalizeBlogContentUrls(content, req) {
  if (!content || typeof content !== "string") {
    return content;
  }

  return content.replace(/(src|href)=(["'])([^"']+)\2/gi, (full, attr, quote, urlValue) => {
    const normalizedUrl = normalizeUploadUrl(urlValue, req);
    return `${attr}=${quote}${normalizedUrl}${quote}`;
  });
}

function normalizeBlogForResponse(blog, req) {
  if (!blog) return blog;
  const plain = typeof blog.toObject === "function" ? blog.toObject() : { ...blog };

  plain.featuredImage = normalizeUploadUrl(plain.featuredImage, req);
  plain.ogImage = normalizeUploadUrl(plain.ogImage, req);
  plain.content = normalizeBlogContentUrls(plain.content, req);
  return plain;
}

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
    const normalizedBlogs = blogs.map((blog) => normalizeBlogForResponse(blog, req));

    res.json({
      success: true,
      blogs: normalizedBlogs,
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

// Public route - Get categories (MUST be before /:slug route)
router.get("/meta/categories", async (req, res) => {
  try {
    const categories = await Blog.distinct("category", { status: "published" });
    res.json({ success: true, categories: categories.filter(c => c) });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ success: false, error: "Failed to fetch categories" });
  }
});

// Public route - Get tags (MUST be before /:slug route)
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

// Public route - Get single blog by slug (MUST be last to avoid catching meta routes)
router.get("/:slug", async (req, res) => {
  try {
    // Don't treat "meta" or "admin" as slugs
    if (req.params.slug === "meta" || req.params.slug === "admin") {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }

    const blog = await Blog.findOne({ slug: req.params.slug, status: "published" })
      .populate("author", "name email");

    if (!blog) {
      return res.status(404).json({ success: false, error: "Blog not found" });
    }

    // Increment views
    blog.views += 1;
    await blog.save();

    res.json({ success: true, blog: normalizeBlogForResponse(blog, req) });
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
    const normalizedBlogs = blogs.map((blog) => normalizeBlogForResponse(blog, req));

    res.json({
      success: true,
      blogs: normalizedBlogs,
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

    res.json({ success: true, blog: normalizeBlogForResponse(blog, req) });
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({ success: false, error: "Failed to fetch blog" });
  }
});

/**
 * POST /api/blog/admin/upload-image
 * Upload blog image and return a hosted URL (prevents large inline base64 content).
 */
router.post("/admin/upload-image", authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { imageData, fileName } = req.body || {};

    if (!imageData || typeof imageData !== "string") {
      return res.status(400).json({
        success: false,
        error: "imageData is required"
      });
    }

    const match = imageData.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
    if (!match) {
      return res.status(400).json({
        success: false,
        error: "Only PNG, JPG, JPEG, WEBP, and GIF images are allowed"
      });
    }

    const [, rawExt, base64Payload] = match;
    const buffer = Buffer.from(base64Payload, "base64");
    if (!buffer.length) {
      return res.status(400).json({
        success: false,
        error: "Invalid image payload"
      });
    }

    if (buffer.length > BLOG_IMAGE_MAX_BYTES) {
      return res.status(400).json({
        success: false,
        error: "Image exceeds 8MB limit"
      });
    }

    const ext = rawExt.toLowerCase() === "jpeg" ? "jpg" : rawExt.toLowerCase();
    const safeName = String(fileName || "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);

    const uploadDir = path.join(process.cwd(), "uploads", "blog");
    await fs.mkdir(uploadDir, { recursive: true });

    const generatedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeName ? `-${safeName}` : ""}.${ext}`;
    const fullPath = path.join(uploadDir, generatedName);
    await fs.writeFile(fullPath, buffer);

    const relativeUrl = `/api/uploads/blog/${generatedName}`;
    const imageUrl = getPublicAssetUrl(relativeUrl);

    return res.json({
      success: true,
      imageUrl,
      sizeBytes: buffer.length
    });
  } catch (error) {
    console.error("Error uploading blog image:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to upload image"
    });
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
      content: normalizeBlogContentUrls(content, req),
      featuredImage: normalizeUploadUrl(featuredImage, req),
      author: req.userId,
      authorName: authorName,
      status: status || "draft",
      publishedAt: status === "published" ? new Date() : null,
      metaTitle,
      metaDescription,
      metaKeywords: Array.isArray(metaKeywords) ? metaKeywords : [],
      ogImage: normalizeUploadUrl(ogImage, req),
      category,
      tags: Array.isArray(tags) ? tags : [],
      adsenseEnabled: adsenseEnabled !== false,
      adsenseCode
    });

    await blog.save();

    await createAdminNotification({
      type: "blog",
      title: "Blog created",
      message: `New blog "${blog.title}" was created`,
      sourceModel: "Blog",
      sourceId: blog._id,
      data: {
        blogId: blog._id.toString(),
        title: blog.title,
        status: blog.status
      }
    });

    console.log("Blog created successfully:", blog._id);
    res.status(201).json({ success: true, blog: normalizeBlogForResponse(blog, req) });
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
    if (content !== undefined) blog.content = normalizeBlogContentUrls(content, req);
    if (featuredImage !== undefined) blog.featuredImage = normalizeUploadUrl(featuredImage, req);
    if (metaTitle !== undefined) blog.metaTitle = metaTitle;
    if (metaDescription !== undefined) blog.metaDescription = metaDescription;
    if (metaKeywords !== undefined) blog.metaKeywords = Array.isArray(metaKeywords) ? metaKeywords : [];
    if (ogImage !== undefined) blog.ogImage = normalizeUploadUrl(ogImage, req);
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

    if (status !== undefined) {
      await createAdminNotification({
        type: "blog",
        title: "Blog updated",
        message: `Blog "${blog.title}" status changed to ${blog.status}`,
        sourceModel: "Blog",
        sourceId: blog._id,
        data: {
          blogId: blog._id.toString(),
          title: blog.title,
          status: blog.status
        }
      });
    }

    console.log("Blog updated successfully:", blog._id);
    res.json({ success: true, blog: normalizeBlogForResponse(blog, req) });
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

export default router;
