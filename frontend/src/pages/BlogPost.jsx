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
  const [popularBlogs, setPopularBlogs] = useState([]);
  const [latestBlogs, setLatestBlogs] = useState([]);

  useEffect(() => {
    fetchBlog();
  }, [slug]);

  const normalizeImageUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    const value = rawUrl.trim();
    if (!value) return value;
    const isLocalDevHost = ['localhost', '127.0.0.1'].includes(window.location.hostname.toLowerCase());
    const toPreferredUploadPath = (pathname = '') => {
      if (pathname.startsWith('/api/uploads/')) {
        return isLocalDevHost
          ? pathname
          : pathname.replace('/api/uploads/', '/uploads/');
      }
      if (pathname.startsWith('/uploads/')) {
        return isLocalDevHost
          ? `/api${pathname}`
          : pathname;
      }
      return pathname;
    };

    if (value.startsWith('/api/uploads/') || value.startsWith('/uploads/')) {
      return toPreferredUploadPath(value);
    }

    try {
      const parsed = new URL(value);
      if (!parsed.pathname.startsWith('/uploads/') && !parsed.pathname.startsWith('/api/uploads/')) return value;
      const host = parsed.hostname.toLowerCase();
      const currentHost = window.location.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === currentHost) {
        const normalizedPath = toPreferredUploadPath(parsed.pathname);
        return `${normalizedPath}${parsed.search || ''}`;
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
        fetchSidebarBlogs(normalizedBlog);
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

  const fetchSidebarBlogs = async (currentBlog) => {
    try {
      const params = new URLSearchParams();
      params.append('limit', '40');
      const response = await API.get(`/api/blog?${params.toString()}`);

      if (!response.data?.success) {
        setPopularBlogs([]);
        setLatestBlogs([]);
        return;
      }

      const normalized = (response.data.blogs || [])
        .map((item) => normalizeBlogPayload(item))
        .filter((item) => item?._id && item._id !== currentBlog._id);

      const latest = [...normalized]
        .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
        .slice(0, 6);

      const popular = [...normalized]
        .sort((a, b) => {
          const viewDiff = Number(b.views || 0) - Number(a.views || 0);
          if (viewDiff !== 0) return viewDiff;
          return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
        })
        .slice(0, 6);

      setLatestBlogs(latest);
      setPopularBlogs(popular);
    } catch (error) {
      console.error('Error fetching sidebar blogs:', error);
      setPopularBlogs([]);
      setLatestBlogs([]);
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
  const renderSidebarSection = (title, items, { showViews = false } = {}) => (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No posts available yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item._id}
              to={`/blog/${item.slug}`}
              className="group block rounded-lg p-2 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors"
            >
              <div className="flex gap-3 items-start">
                {item.featuredImage ? (
                  <div className="w-20 h-16 shrink-0 rounded-md border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50 overflow-hidden flex items-center justify-center">
                    <img
                      src={item.featuredImage}
                      alt={item.title}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-16 shrink-0 rounded-md border border-dashed border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900/50" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-300">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(item.publishedAt)}
                    {showViews && Number(item.views || 0) > 0 ? ` • ${item.views} views` : ''}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

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
          <div className="max-w-7xl mx-auto px-4">
            <nav className="text-sm text-gray-600 dark:text-gray-400">
              <Link to="/" className="hover:text-indigo-600">Home</Link>
              {' / '}
              <Link to="/blog" className="hover:text-indigo-600">Blog</Link>
              {' / '}
              <span className="text-gray-900 dark:text-white">{blog.title}</span>
            </nav>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <article className="lg:col-span-8 xl:col-span-9">
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
                    className="w-full max-h-[560px] h-auto object-contain rounded-lg"
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
                        className="block bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 hover:shadow-lg transition-shadow overflow-hidden h-fit"
                      >
                        {related.featuredImage && (
                          <img
                            src={related.featuredImage}
                            alt={related.title}
                            className="w-full h-auto object-contain bg-gray-50 dark:bg-slate-900/50"
                            loading="lazy"
                          />
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

            <aside className="lg:col-span-4 xl:col-span-3">
              <div className="space-y-6 lg:sticky lg:top-24">
                {renderSidebarSection('Popular Blogs', popularBlogs, { showViews: true })}
                {renderSidebarSection('New Blogs', latestBlogs)}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

export default BlogPost;
