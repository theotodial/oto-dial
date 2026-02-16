import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import API from '../api';
import Navbar from '../components/Navbar';
import '../styles/blog.css';

function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [relatedBlogs, setRelatedBlogs] = useState([]);

  useEffect(() => {
    fetchBlog();
  }, [slug]);

  const normalizeImageUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    const value = rawUrl.trim();
    if (!value) return value;
    if (value.startsWith('/api/uploads/')) return value;
    if (value.startsWith('/uploads/')) return `/api${value}`;

    try {
      const parsed = new URL(value);
      if (!parsed.pathname.startsWith('/uploads/') && !parsed.pathname.startsWith('/api/uploads/')) return value;
      const host = parsed.hostname.toLowerCase();
      const currentHost = window.location.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === currentHost) {
        if (parsed.pathname.startsWith('/api/uploads/')) {
          return `${parsed.pathname}${parsed.search || ''}`;
        }
        return `/api${parsed.pathname}${parsed.search || ''}`;
      }
    } catch {
      return value;
    }

    return value;
  };

  const normalizeHtmlAssetUrls = (html) => {
    if (!html || typeof html !== 'string') return html;
    return html.replace(/(src|href)=(["'])([^"']+)\2/gi, (full, attr, quote, url) => {
      const normalized = normalizeImageUrl(url);
      return `${attr}=${quote}${normalized}${quote}`;
    });
  };

  const normalizeBlogPayload = (rawBlog) => {
    if (!rawBlog) return rawBlog;
    return {
      ...rawBlog,
      featuredImage: normalizeImageUrl(rawBlog.featuredImage),
      ogImage: normalizeImageUrl(rawBlog.ogImage),
      content: normalizeHtmlAssetUrls(rawBlog.content)
    };
  };

  const fetchBlog = async () => {
    try {
      setLoading(true);
      const response = await API.get(`/api/blog/${slug}`);
      if (response.data?.success) {
        const normalizedBlog = normalizeBlogPayload(response.data.blog);
        setBlog(normalizedBlog);
        fetchRelatedBlogs(normalizedBlog);
      } else {
        navigate('/blog');
      }
    } catch (error) {
      console.error('Error fetching blog:', error);
      navigate('/blog');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedBlogs = async (currentBlog) => {
    try {
      const params = new URLSearchParams();
      if (currentBlog.category) params.append('category', currentBlog.category);
      params.append('limit', '3');
      
      const response = await API.get(`/api/blog?${params.toString()}`);
      if (response.data?.success) {
        // Filter out current blog
        const related = response.data.blogs
          .filter(b => b._id !== currentBlog._id)
          .map((item) => normalizeBlogPayload(item))
          .slice(0, 3);
        setRelatedBlogs(related);
      }
    } catch (error) {
      console.error('Error fetching related blogs:', error);
    }
  };

  useEffect(() => {
    if (blog) {
      const metaTitle = blog.metaTitle || blog.title;
      document.title = `${metaTitle} | OTO DIAL Blog`;
      
      // Update meta description
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', blog.metaDescription || blog.excerpt || '');
      
      // Update OG tags
      const updateMetaTag = (property, content) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (!tag) {
          tag = document.createElement('meta');
          tag.setAttribute('property', property);
          document.head.appendChild(tag);
        }
        tag.setAttribute('content', content);
      };
      
      if (blog.ogImage || blog.featuredImage) {
        updateMetaTag('og:image', blog.ogImage || blog.featuredImage);
      }
      updateMetaTag('og:title', metaTitle);
      updateMetaTag('og:description', blog.metaDescription || blog.excerpt || '');
      updateMetaTag('og:url', `https://otodial.com/blog/${blog.slug}`);
    }
  }, [blog]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Render AdSense ad unit
  const renderAdSense = () => {
    if (!blog?.adsenseEnabled || !blog?.adsenseCode) return null;
    
    return (
      <div className="my-8 p-4 bg-gray-100 dark:bg-slate-800 rounded-lg text-center">
        <div dangerouslySetInnerHTML={{ __html: blog.adsenseCode }} />
      </div>
    );
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </>
    );
  }

  if (!blog) {
    return null;
  }

  const metaTitle = blog.metaTitle || blog.title;
  const metaDescription = blog.metaDescription || blog.excerpt || '';
  const ogImage = blog.ogImage || blog.featuredImage || '';

  return (
    <>
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": blog.title,
            "description": metaDescription,
            "image": ogImage,
            "datePublished": blog.publishedAt,
            "dateModified": blog.updatedAt || blog.publishedAt,
            "author": {
              "@type": "Person",
              "name": blog.authorName || "OTO DIAL"
            },
            "publisher": {
              "@type": "Organization",
              "name": "OTO DIAL",
              "logo": {
                "@type": "ImageObject",
                "url": "https://otodial.com/logo.png"
              }
            }
          })
        }}
      />
      <Navbar />
      <div className="min-h-screen bg-white dark:bg-slate-900">
        {/* Breadcrumb */}
        <div className="bg-gray-50 dark:bg-slate-800 py-4">
          <div className="max-w-4xl mx-auto px-4">
            <nav className="text-sm text-gray-600 dark:text-gray-400">
              <Link to="/" className="hover:text-indigo-600">Home</Link>
              {' / '}
              <Link to="/blog" className="hover:text-indigo-600">Blog</Link>
              {' / '}
              <span className="text-gray-900 dark:text-white">{blog.title}</span>
            </nav>
          </div>
        </div>

        <article className="max-w-4xl mx-auto px-4 py-12">
          {/* Header */}
          <header className="mb-8">
            {blog.category && (
              <span className="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-sm font-medium rounded-full mb-4">
                {blog.category}
              </span>
            )}
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {blog.title}
            </h1>
            {blog.excerpt && (
              <p className="text-xl text-gray-600 dark:text-gray-400 mb-6">
                {blog.excerpt}
              </p>
            )}
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span>{formatDate(blog.publishedAt)}</span>
              {blog.readingTime > 0 && <span>• {blog.readingTime} min read</span>}
              {blog.views > 0 && <span>• {blog.views} views</span>}
            </div>
          </header>

          {/* Featured Image */}
          {blog.featuredImage && (
            <div className="mb-8 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-3">
              <img
                src={blog.featuredImage}
                alt={blog.title}
                className="w-full max-h-[520px] object-contain rounded-lg"
                loading="lazy"
              />
            </div>
          )}

          {/* AdSense - Top */}
          {renderAdSense()}

          {/* Content */}
          <div
            className="blog-content mb-12 text-lg leading-8"
            dangerouslySetInnerHTML={{ __html: blog.content }}
          />

          {/* AdSense - Middle */}
          {renderAdSense()}

          {/* Tags */}
          {blog.tags && blog.tags.length > 0 && (
            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-slate-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tags:</h3>
              <div className="flex flex-wrap gap-2">
                {blog.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/blog?tag=${encodeURIComponent(tag)}`}
                    className="px-3 py-1 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-full text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* AdSense - Bottom */}
          {renderAdSense()}

          {/* Related Blogs */}
          {relatedBlogs.length > 0 && (
            <div className="mt-16 pt-8 border-t border-gray-200 dark:border-slate-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Related Articles</h2>
              <div className="grid md:grid-cols-3 gap-6">
                {relatedBlogs.map((related) => (
                  <Link
                    key={related._id}
                    to={`/blog/${related.slug}`}
                    className="block bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 hover:shadow-lg transition-shadow overflow-hidden"
                  >
                    {related.featuredImage && (
                      <div className="w-full bg-gray-50 dark:bg-slate-900/50 border-b border-gray-100 dark:border-slate-700/60">
                        <div className="h-40 flex items-center justify-center p-3">
                          <img
                            src={related.featuredImage}
                            alt={related.title}
                            className="w-full h-full object-contain rounded-lg"
                            loading="lazy"
                          />
                        </div>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
                        {related.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(related.publishedAt)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>
    </>
  );
}

export default BlogPost;
