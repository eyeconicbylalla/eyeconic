import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { PencilLine, Plus, RefreshCcw, Trash2, Eye, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';
import type { BlogDocument, BlogSummary, BlogDashboardResponse } from '../../types/blog';

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';

const getAuthParams = () => ({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

interface BlogForm {
  title: string;
  description: string;
  author: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  featured: boolean;
  published: boolean;
}

const emptyBlogForm: BlogForm = {
  title: '',
  description: '',
  author: 'Eyeconic Editorial Team',
  youtubeUrl: '',
  thumbnailUrl: '',
  featured: false,
  published: true
};

const convertToHtml = (text: string) => {
  if (!text) return '';
  return text
    .split(/\n\s*\n/)
    .map(para => {
      const cleaned = para.replace(/\n/g, '<br />');
      return `<p>${cleaned}</p>`;
    })
    .join('');
};

const convertToPlainText = (html: string) => {
  if (!html) return '';
  // Replace </p><p> with double newlines
  let text = html.replace(/<\/p>\s*<p>/gi, '\n\n');
  // Replace <p> and </p> with nothing
  text = text.replace(/<\/?p>/gi, '');
  // Replace <br /> or <br> with single newline
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  return text;
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const BlogCmsPanel: React.FC = () => {
  const [blogs, setBlogs] = useState<BlogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBlog, setLoadingBlog] = useState(false);
  const [submittingBlog, setSubmittingBlog] = useState(false);
  const [editingBlogId, setEditingBlogId] = useState('');
  const [blogForm, setBlogForm] = useState<BlogForm>(emptyBlogForm);
  const [blogError, setBlogError] = useState('');
  const [blogMessage, setBlogMessage] = useState('');

  const fetchBlogs = async () => {
    setLoading(true);
    setBlogError('');
    try {
      const response = await axios.get<BlogDashboardResponse>(`${API_BASE_URL}/blogs/admin`, {
        params: getAuthParams(),
      });
      setBlogs(response.data.blogs || []);
    } catch (error) {
      setBlogs([]);
      setBlogError('Unable to load blogs right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlogs();
  }, []);

  const resetBlogForm = () => {
    setEditingBlogId('');
    setBlogForm(emptyBlogForm);
    setBlogError('');
    setBlogMessage('');
  };

  const startEditingBlog = async (blogId: string) => {
    setBlogError('');
    setBlogMessage('');
    setLoadingBlog(true);
    try {
      const response = await axios.get<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${blogId}`, {
        params: getAuthParams(),
      });
      const blog = response.data.blog;
      setEditingBlogId(blog._id);
      setBlogForm({
        title: blog.title,
        description: convertToPlainText(blog.contentHtml),
        author: blog.author?.name || 'Eyeconic Editorial Team',
        youtubeUrl: blog.youtubeUrl || '',
        thumbnailUrl: blog.featuredImage?.url || '',
        featured: blog.isFeatured || false,
        published: blog.status === 'published'
      });
    } catch (err) {
      setBlogError('Failed to load blog details for editing.');
    } finally {
      setLoadingBlog(false);
    }
  };

  const submitBlog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blogForm.title.trim()) {
      setBlogError('Blog title is required.');
      return;
    }
    setSubmittingBlog(true);
    setBlogError('');
    setBlogMessage('');

    const contentHtml = convertToHtml(blogForm.description);
    
    const payload = {
      ...getAuthParams(),
      title: blogForm.title,
      contentHtml: contentHtml,
      description: blogForm.description,
      author: {
        name: blogForm.author,
        email: ADMIN_EMAIL,
        role: 'Admin'
      },
      youtubeUrl: blogForm.youtubeUrl,
      featuredImage: {
        url: blogForm.thumbnailUrl,
        altText: blogForm.title,
        title: blogForm.title,
        type: 'image'
      },
      isFeatured: blogForm.featured,
      status: blogForm.published ? 'published' : 'draft',
      publishAt: blogForm.published ? new Date().toISOString() : undefined,
      category: { name: 'General', slug: 'general' }
    };

    try {
      if (editingBlogId) {
        await axios.put(`${API_BASE_URL}/blogs/admin/${editingBlogId}`, payload);
        setBlogMessage('Blog updated successfully.');
      } else {
        await axios.post(`${API_BASE_URL}/blogs/admin`, payload);
        setBlogMessage('Blog created successfully.');
      }
      resetBlogForm();
      await fetchBlogs();
    } catch (error: any) {
      const msg = error.response?.data?.msg || error.response?.data?.error || 'Failed to save blog';
      setBlogError(msg);
    } finally {
      setSubmittingBlog(false);
    }
  };

  const deleteBlog = async (id: string) => {
    if (!window.confirm('Delete this blog post?')) return;
    setBlogError('');
    setBlogMessage('');
    try {
      await axios.delete(`${API_BASE_URL}/blogs/admin/${id}`, {
        data: getAuthParams(),
      });
      setBlogMessage('Blog deleted successfully.');
      if (editingBlogId === id) {
        resetBlogForm();
      }
      await fetchBlogs();
    } catch (error: any) {
      const msg = error.response?.data?.msg || error.response?.data?.error || 'Failed to delete blog';
      setBlogError(msg);
    }
  };

  const toggleFeature = async (blog: BlogSummary) => {
    setBlogError('');
    setBlogMessage('');
    try {
      await axios.patch(`${API_BASE_URL}/blogs/admin/${blog._id}/feature`, {
        ...getAuthParams(),
        isFeatured: !blog.isFeatured,
      });
      await fetchBlogs();
    } catch (error: any) {
      setBlogError('Failed to toggle featured flag.');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* Create / Edit Blog Form */}
      <div>
        <form
          onSubmit={submitBlog}
          className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-white">
                {editingBlogId ? 'Edit Blog' : 'Create Blog'}
              </h3>
              <p className="mt-1 text-xs text-[#94A3B8] leading-relaxed">
                YouTube links are optional. If provided, the backend captures the thumbnail automatically.
              </p>
            </div>
            {editingBlogId && (
              <button
                type="button"
                onClick={resetBlogForm}
                className="rounded-full border border-white/[0.08] bg-[#1E2A38] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#CBD5E1] hover:bg-[#263445] hover:text-white transition"
              >
                Cancel
              </button>
            )}
          </div>

          {loadingBlog ? (
            <div className="py-8 text-center text-xs text-[#94A3B8]">Loading blog details...</div>
          ) : (
            <div className="space-y-3.5">
              <input
                type="text"
                value={blogForm.title}
                onChange={(e) => setBlogForm((curr) => ({ ...curr, title: e.target.value }))}
                placeholder="Blog title"
                className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]"
                required
              />
              <textarea
                value={blogForm.description}
                onChange={(e) => setBlogForm((curr) => ({ ...curr, description: e.target.value }))}
                placeholder="Blog description"
                className="min-h-[180px] w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]"
                required
              />
              <input
                type="text"
                value={blogForm.author}
                onChange={(e) => setBlogForm((curr) => ({ ...curr, author: e.target.value }))}
                placeholder="Author name"
                className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]"
                required
              />
              <input
                type="url"
                value={blogForm.youtubeUrl}
                onChange={(e) => setBlogForm((curr) => ({ ...curr, youtubeUrl: e.target.value }))}
                placeholder="YouTube link (optional)"
                className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]"
              />
              <input
                type="url"
                value={blogForm.thumbnailUrl}
                onChange={(e) => setBlogForm((curr) => ({ ...curr, thumbnailUrl: e.target.value }))}
                placeholder="Manual Thumbnail URL (optional)"
                className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]"
              />
              <label className="flex items-center gap-3 rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-3 text-sm text-[#CBD5E1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={blogForm.featured}
                  onChange={(e) => setBlogForm((curr) => ({ ...curr, featured: e.target.checked }))}
                  className="h-4 w-4 rounded border-[#263445] bg-[#151E29] accent-[#18B6A4]"
                />
                Mark as featured post
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-3 text-sm text-[#CBD5E1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={blogForm.published}
                  onChange={(e) => setBlogForm((curr) => ({ ...curr, published: e.target.checked }))}
                  className="h-4 w-4 rounded border-[#263445] bg-[#151E29] accent-[#18B6A4]"
                />
                Publish Immediately
              </label>
            </div>
          )}

          {blogError && <p className="text-xs font-semibold text-rose-400">{blogError}</p>}
          {blogMessage && <p className="text-xs font-semibold text-emerald-400">{blogMessage}</p>}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#18B6A4] to-[#1CC8B5] px-5 py-3 text-sm font-bold text-[#0A0F14] hover:shadow-[0_0_15px_rgba(24,182,164,0.35)] transition-all duration-200 disabled:opacity-60"
            disabled={submittingBlog || loadingBlog}
          >
            {editingBlogId ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {submittingBlog ? 'Saving...' : editingBlogId ? 'Update blog' : 'Create blog'}
          </button>
        </form>
      </div>

      {/* Blogs Inventory */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
          <h3 className="text-xl font-bold text-white">All Blog Posts</h3>
          <button
            onClick={fetchBlogs}
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#1E2A38] px-3.5 py-2 text-xs font-semibold text-[#CBD5E1] hover:bg-[#263445] hover:text-white transition duration-200"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh list
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-[#94A3B8]">Loading blog posts...</div>
        ) : blogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center text-sm text-[#94A3B8]">
            No blogs yet. The public blog page will update as soon as you publish one.
          </div>
        ) : (
          <div className="grid gap-4">
            {blogs.map((blog) => (
              <article
                key={blog._id}
                className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#151E29] transition hover:border-[#18B6A4]/20"
              >
                <div className="flex flex-col sm:flex-row">
                  {/* Thumbnail */}
                  <div className="h-32 sm:w-48 bg-[#0F172A] flex-shrink-0 relative overflow-hidden">
                    {blog.featuredImage?.url ? (
                      <img
                        src={blog.featuredImage.url}
                        alt={blog.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#64748B] bg-gradient-to-br from-teal-950/20 to-cyan-950/20">
                        No thumbnail
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#CBD5E1]">
                        {blog.isFeatured && (
                          <span className="rounded-full bg-[#18B6A4]/20 border border-[#18B6A4]/30 px-2 py-0.5 text-[#18B6A4]">
                            Featured
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            blog.status === 'published'
                              ? 'bg-emerald-950/40 border border-emerald-500/20 text-emerald-400'
                              : 'bg-white/5 border border-white/10 text-[#64748B]'
                          }`}
                        >
                          {blog.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        <span>{formatDate(blog.publishAt || blog.createdAt)}</span>
                      </div>
                      <h4 className="mt-2 text-base font-bold text-white line-clamp-1">{blog.title}</h4>
                      <p className="mt-1 text-xs text-[#94A3B8] line-clamp-2">{blog.excerpt}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.04] pt-3">
                      <span className="text-xs text-[#64748B]">By {blog.author?.name || 'Unknown'}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditingBlog(blog._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#1E2A38] px-2.5 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-[#18B6A4] hover:text-[#18B6A4] transition duration-200"
                        >
                          <PencilLine className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeature(blog)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#1E2A38] px-2.5 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-amber-500 hover:text-amber-500 transition duration-200"
                        >
                          <Star className={`w-3.5 h-3.5 ${blog.isFeatured ? 'fill-current text-amber-500' : ''}`} /> Feature
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBlog(blog._id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-950/20 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-950/40 hover:text-red-300 transition duration-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                        <Link
                          to={`/blog/${blog.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-[#1E2A38] px-2.5 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-[#18B6A4] hover:text-[#18B6A4] transition duration-200"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BlogCmsPanel;