import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import API from '../../api';
import RichTextEditor from '../../components/admin/RichTextEditor';
import MediaLibrary from '../../components/admin/MediaLibrary';

function AdminBlog() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = !!id;
  const isNew = location.pathname.includes('/new');

  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [showEditor, setShowEditor] = useState(false);
  const [selectedBlog, setSelectedBlog] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [mediaLibraryMode, setMediaLibraryMode] = useState('featured'); // 'featured' or 'content'

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    featuredImage: '',
    status: 'draft',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    ogImage: '',
    category: '',
    tags: '',
    adsenseEnabled: true,
    adsenseCode: ''
  });

  useEffect(() => {
    if (!isNew && !isEdit) {
      fetchBlogs();
    }
    if (isEdit) {
      fetchBlog();
    }
    if (isNew) {
      setShowEditor(true);
    }
  }, [page, filters, isEdit, isNew]);

  const fetchBlogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', '20');
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);

      const response = await API.get(`/api/blog/admin/all?${params.toString()}`);

      if (response.data?.success) {
        setBlogs(response.data.blogs || []);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchBlog = async () => {
    try {
      const response = await API.get(`/api/blog/admin/${id}`);

      if (response.data?.success) {
        const blog = response.data.blog;
        setFormData({
          title: blog.title || '',
          slug: blog.slug || '',
          excerpt: blog.excerpt || '',
          content: blog.content || '',
          featuredImage: blog.featuredImage || '',
          status: blog.status || 'draft',
          metaTitle: blog.metaTitle || '',
          metaDescription: blog.metaDescription || '',
          metaKeywords: Array.isArray(blog.metaKeywords) ? blog.metaKeywords.join(', ') : '',
          ogImage: blog.ogImage || '',
          category: blog.category || '',
          tags: Array.isArray(blog.tags) ? blog.tags.join(', ') : '',
          adsenseEnabled: blog.adsenseEnabled !== false,
          adsenseCode: blog.adsenseCode || ''
        });
        setShowEditor(true);
      }
    } catch (err) {
      console.error('Error fetching blog:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Auto-generate slug from title
    if (name === 'title' && !formData.slug) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        metaKeywords: formData.metaKeywords.split(',').map(k => k.trim()).filter(k => k),
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t)
      };

      let response;
      if (isEdit) {
        response = await API.put(`/api/blog/admin/${id}`, payload);
      } else {
        response = await API.post('/api/blog/admin', payload);
      }

      // Check for errors first (API wrapper returns { data: null, error: ... } on error)
      if (response.error || !response.data) {
        console.error('Blog save error:', response.error || 'No data returned');
        console.error('Response:', response);
        if (response.status === 401) {
          localStorage.removeItem('adminToken');
          navigate('/adminbobby');
          return;
        }
        const errorMsg = response.error || response.data?.error || 'Failed to save blog';
        alert(`Error: ${errorMsg}`);
        return;
      }

      // Check for success
      if (response.data?.success) {
        alert(isEdit ? 'Blog updated successfully!' : 'Blog created successfully!');
        setShowEditor(false);
        setFormData({
          title: '',
          slug: '',
          excerpt: '',
          content: '',
          featuredImage: '',
          status: 'draft',
          metaTitle: '',
          metaDescription: '',
          metaKeywords: '',
          ogImage: '',
          category: '',
          tags: '',
          adsenseEnabled: true,
          adsenseCode: ''
        });
        fetchBlogs();
        if (isEdit || isNew) {
          navigate('/adminbobby/blog');
        }
      } else {
        const errorMsg = response.data?.error || response.error || 'Failed to save blog';
        console.error('Blog save failed:', response);
        alert(`Error: ${errorMsg}`);
      }
    } catch (err) {
      console.error('Save blog error:', err);
      console.error('Error response:', err.response);
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        const errorMessage = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to save blog';
        alert(`Error: ${errorMessage}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (blogId) => {
    if (!confirm('Are you sure you want to delete this blog?')) return;

    try {
      const response = await API.delete(`/api/blog/admin/${blogId}`);

      if (response.data?.success) {
        alert('Blog deleted successfully!');
        fetchBlogs();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete blog');
    }
  };

  const handleEdit = (blog) => {
    navigate(`/adminbobby/blog/${blog._id}`);
  };

  const handleNew = () => {
    navigate('/adminbobby/blog/new');
    setShowEditor(true);
    setFormData({
      title: '',
      slug: '',
      excerpt: '',
      content: '',
      featuredImage: '',
      status: 'draft',
      metaTitle: '',
      metaDescription: '',
      metaKeywords: '',
      ogImage: '',
      category: '',
      tags: '',
      adsenseEnabled: true,
      adsenseCode: ''
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  if (isEdit || isNew || showEditor) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {(isEdit || showEditor) && !isNew ? 'Edit Blog Post' : 'New Blog Post'}
          </h1>
            <button
              onClick={() => {
                navigate('/adminbobby/blog');
                setShowEditor(false);
                if (isNew) {
                  navigate('/adminbobby/blog');
                }
              }}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Back to List
            </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Slug *</label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="blog-post-url-slug"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Excerpt</label>
                <textarea
                  name="excerpt"
                  value={formData.excerpt}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="Short description of the blog post"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Content *</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMediaLibraryMode('content');
                        setShowMediaLibrary(true);
                      }}
                      className="px-3 py-1 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600"
                    >
                      📷 Media Library
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPreview(!showPreview)}
                      className="px-3 py-1 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600"
                    >
                      {showPreview ? '✏️ Edit' : '👁️ Preview'}
                    </button>
                  </div>
                </div>
                {showPreview ? (
                  <div 
                    className="w-full min-h-[400px] px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white prose prose-lg dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: formData.content }}
                  />
                ) : (
                  <RichTextEditor
                    value={formData.content}
                    onChange={(content) => setFormData(prev => ({ ...prev, content }))}
                    placeholder="Start writing your blog post..."
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Featured Image</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    name="featuredImage"
                    value={formData.featuredImage}
                    onChange={handleInputChange}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    placeholder="https://example.com/image.jpg or click Select to choose from media library"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setMediaLibraryMode('featured');
                      setShowMediaLibrary(true);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Select
                  </button>
                </div>
                {formData.featuredImage && (
                  <div className="mt-2">
                    <img
                      src={formData.featuredImage}
                      alt="Featured"
                      className="max-w-xs h-32 object-cover rounded-lg border border-gray-300 dark:border-slate-600"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">SEO Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Meta Title</label>
                <input
                  type="text"
                  name="metaTitle"
                  value={formData.metaTitle}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="Leave empty to use blog title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Meta Description</label>
                <textarea
                  name="metaDescription"
                  value={formData.metaDescription}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="SEO description (150-160 characters recommended)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Meta Keywords (comma-separated)</label>
                <input
                  type="text"
                  name="metaKeywords"
                  value={formData.metaKeywords}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="keyword1, keyword2, keyword3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">OG Image URL</label>
                <input
                  type="url"
                  name="ogImage"
                  value={formData.ogImage}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="https://example.com/og-image.jpg"
                />
              </div>
            </div>
          </div>

          {/* Categories & Tags */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">Categories & Tags</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Virtual Numbers, Cloud Calling"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  placeholder="tag1, tag2, tag3"
                />
              </div>
            </div>
          </div>

          {/* AdSense */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold mb-4">AdSense Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  name="adsenseEnabled"
                  checked={formData.adsenseEnabled}
                  onChange={handleInputChange}
                  className="mr-2"
                />
                <label>Enable AdSense for this post</label>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">AdSense Code</label>
                <textarea
                  name="adsenseCode"
                  value={formData.adsenseCode}
                  onChange={handleInputChange}
                  rows="5"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white font-mono text-sm"
                  placeholder="Paste your Google AdSense ad unit code here"
                />
                <p className="text-xs text-gray-500 mt-1">Paste the complete AdSense ad unit code (script tag)</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : (isEdit ? 'Update Blog' : 'Create Blog')}
            </button>
            <button
              type="button"
              onClick={() => {
                navigate('/adminbobby/blog');
                setShowEditor(false);
              }}
              className="px-6 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Media Library Modal */}
        <MediaLibrary
          isOpen={showMediaLibrary}
          mode={mediaLibraryMode}
          onClose={() => setShowMediaLibrary(false)}
          onSelect={(url) => {
            if (mediaLibraryMode === 'featured') {
              setFormData(prev => ({ ...prev, featuredImage: url }));
            } else {
              // Insert image into content
              const quill = document.querySelector('.ql-editor');
              if (quill) {
                // This will be handled by the RichTextEditor's image handler
                // For now, we'll append an img tag
                const currentContent = formData.content;
                const imgTag = `<img src="${url}" alt="" style="max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1.5rem 0;" />`;
                setFormData(prev => ({ ...prev, content: currentContent + imgTag }));
              }
            }
            setShowMediaLibrary(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Blog Management</h1>
        <button
          onClick={handleNew}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          + New Blog Post
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search blogs..."
          value={filters.search}
          onChange={(e) => {
            setFilters(prev => ({ ...prev, search: e.target.value }));
            setPage(1);
          }}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
        />
        <select
          value={filters.status}
          onChange={(e) => {
            setFilters(prev => ({ ...prev, status: e.target.value }));
            setPage(1);
          }}
          className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Blog List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Published</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Views</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {blogs.map((blog) => (
                <tr key={blog._id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900 dark:text-white">{blog.title}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{blog.slug}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      blog.status === 'published' ? 'bg-green-100 text-green-800' :
                      blog.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {blog.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{blog.category || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(blog.publishedAt)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{blog.views || 0}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(blog)}
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(blog._id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminBlog;
