import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import API from '../api';
import Navbar from '../components/Navbar';

function Blog() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [filters, setFilters] = useState({
    category: '',
    tag: '',
    search: '',
    page: 1
  });

  useEffect(() => {
    fetchBlogs();
    fetchMeta();
  }, [filters]);

  const normalizeImageUrl = (rawUrl) => {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    const value = rawUrl.trim();
    if (!value) return value;
    const toPreferredUploadPath = (pathname = '') => {
      if (pathname.startsWith('/api/uploads/')) return pathname;
      if (pathname.startsWith('/uploads/')) return `/api${pathname}`;
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

  const getAlternateUploadUrl = (url = '') => {
    const value = String(url || '').trim();
    if (!value) return '';
    if (value.includes('/api/uploads/')) return value.replace('/api/uploads/', '/uploads/');
    if (value.includes('/uploads/')) return value.replace('/uploads/', '/api/uploads/');
    return '';
  };

  const handleImageError = (event) => {
    const img = event.currentTarget;
    if (!img || img.dataset.fallbackAttempted === 'true') return;
    const alternate = getAlternateUploadUrl(img.currentSrc || img.src);
    if (!alternate || alternate === img.src) return;
    img.dataset.fallbackAttempted = 'true';
    img.src = alternate;
  };

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category);
      if (filters.tag) params.append('tag', filters.tag);
      if (filters.search) params.append('search', filters.search);
      params.append('page', filters.page);
      params.append('limit', '12');

      const response = await API.get(`/api/blog?${params.toString()}`);
      
      if (response.error) {
        console.error('Error fetching blogs:', response.error);
        setBlogs([]);
        return;
      }
      
      if (response.data?.success) {
        const normalizedBlogs = (response.data.blogs || []).map((blog) => ({
          ...blog,
          featuredImage: normalizeImageUrl(blog.featuredImage),
          ogImage: normalizeImageUrl(blog.ogImage)
        }));
        setBlogs(normalizedBlogs);
        setPagination(response.data.pagination || { page: 1, pages: 1, total: 0 });
      } else {
        console.error('Blog fetch failed:', response.data);
        setBlogs([]);
      }
    } catch (error) {
      console.error('Error fetching blogs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMeta = async () => {
    try {
      const [catsRes, tagsRes] = await Promise.all([
        API.get('/api/blog/meta/categories'),
        API.get('/api/blog/meta/tags')
      ]);
      if (!catsRes.error && catsRes.data?.success) setCategories(catsRes.data.categories || []);
      if (!tagsRes.error && tagsRes.data?.success) setTags(tagsRes.data.tags || []);
    } catch (error) {
      console.error('Error fetching meta:', error);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  useEffect(() => {
    document.title = 'Blog - OTO DIAL | Virtual Phone Numbers & Cloud Calling';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Read our blog about virtual phone numbers, cloud calling, international SMS, and remote work tips. Learn how to use OTO DIAL for your business.');
    }
  }, []);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-white dark:bg-slate-900">
        {/* Header */}
        <section className="bg-gradient-to-r from-indigo-600 to-purple-600 py-20">
          <div className="max-w-7xl mx-auto px-4">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">OTO DIAL Blog</h1>
            <p className="text-xl text-indigo-100">Tips, guides, and insights about virtual phone numbers and cloud calling</p>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <aside className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Search
                  </label>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    placeholder="Search blogs..."
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Categories */}
                {categories.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Categories
                    </label>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleFilterChange('category', '')}
                        className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          !filters.category
                            ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        All Categories
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => handleFilterChange('category', cat)}
                          className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            filters.category === cat
                              ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {tags.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {tags.slice(0, 20).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => handleFilterChange('tag', filters.tag === tag ? '' : tag)}
                          className={`px-3 py-1 rounded-full text-xs transition-colors ${
                            filters.tag === tag
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Blog List */}
            <main className="lg:col-span-3">
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : blogs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600 dark:text-gray-400">No blogs found.</p>
                </div>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    {blogs.map((blog) => (
                      <Link
                        key={blog._id}
                        to={`/blog/${blog.slug}`}
                        className="block bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:shadow-lg transition-shadow overflow-hidden h-fit"
                      >
                        {blog.featuredImage && (
                          <img
                            src={blog.featuredImage}
                            alt={blog.title}
                            className="w-full h-auto object-contain bg-gray-50 dark:bg-slate-900/50"
                            loading="lazy"
                            onError={handleImageError}
                          />
                        )}
                        <div className="p-6">
                          {blog.category && (
                            <span className="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-medium rounded-full mb-3">
                              {blog.category}
                            </span>
                          )}
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
                            {blog.title}
                          </h2>
                          {blog.excerpt && (
                            <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
                              {blog.excerpt}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                            <span>{formatDate(blog.publishedAt)}</span>
                            {blog.readingTime > 0 && (
                              <span>{blog.readingTime} min read</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>

                  {/* Pagination */}
                  {pagination.pages > 1 && (
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))}
                        disabled={filters.page === 1}
                        className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-800"
                      >
                        Previous
                      </button>
                      {[...Array(pagination.pages)].map((_, i) => {
                        const page = i + 1;
                        if (
                          page === 1 ||
                          page === pagination.pages ||
                          (page >= filters.page - 1 && page <= filters.page + 1)
                        ) {
                          return (
                            <button
                              key={page}
                              onClick={() => handleFilterChange('page', page)}
                              className={`px-4 py-2 rounded-lg ${
                                filters.page === page
                                  ? 'bg-indigo-600 text-white'
                                  : 'border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-800'
                              }`}
                            >
                              {page}
                            </button>
                          );
                        } else if (
                          page === filters.page - 2 ||
                          page === filters.page + 2
                        ) {
                          return <span key={page} className="px-2">...</span>;
                        }
                        return null;
                      })}
                      <button
                        onClick={() => handleFilterChange('page', Math.min(pagination.pages, filters.page + 1))}
                        disabled={filters.page === pagination.pages}
                        className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-800"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

export default Blog;
