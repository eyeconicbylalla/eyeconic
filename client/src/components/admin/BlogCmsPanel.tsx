import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { 
  PencilLine, Plus, RefreshCcw, Trash2, Eye, Star,
  Bold, Italic, Link2, ArrowUp, ArrowDown, Type,
  Image as ImageIcon, ChevronLeft, Save, FolderOpen, Tag as TagIcon
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';
import type { BlogDocument, BlogSummary, BlogDashboardResponse } from '../../types/blog';

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';

const getAuthParams = () => ({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

interface Block {
  id: string;
  type: 'paragraph' | 'heading' | 'image';
  text?: string;
  headingLevel?: 'h1' | 'h2' | 'h3';
  headingText?: string;
  imageUrl?: string;
  imageCaption?: string;
  imageAlt?: string;
}

interface BlogForm {
  title: string;
  author: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  featured: boolean;
  published: boolean;
}

const emptyBlogForm: BlogForm = {
  title: '',
  author: 'Eyeconic Editorial Team',
  youtubeUrl: '',
  thumbnailUrl: '',
  featured: false,
  published: true
};

const slugify = (value = '') =>
  value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

const parseHtmlToBlocks = (html: string): Block[] => {
  if (!html) return [{ id: Math.random().toString(), type: 'paragraph', text: '' }];
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: Block[] = [];
  
  const childNodes = Array.from(doc.body.childNodes);
  
  childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();
      
      if (tagName === 'p') {
        blocks.push({
          id: Math.random().toString(),
          type: 'paragraph',
          text: element.innerHTML
        });
      } else if (tagName.match(/^h[1-6]$/)) {
        blocks.push({
          id: Math.random().toString(),
          type: 'heading',
          headingLevel: (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') ? tagName : 'h2',
          headingText: element.textContent || ''
        });
      } else if (tagName === 'figure' || tagName === 'img') {
        let src = '';
        let alt = '';
        let caption = '';
        
        if (tagName === 'figure') {
          const img = element.querySelector('img');
          if (img) {
            src = img.getAttribute('src') || '';
            alt = img.getAttribute('alt') || '';
          }
          const figcaption = element.querySelector('figcaption');
          if (figcaption) {
            caption = figcaption.innerHTML || figcaption.textContent || '';
          }
        } else {
          src = element.getAttribute('src') || '';
          alt = element.getAttribute('alt') || '';
        }
        
        blocks.push({
          id: Math.random().toString(),
          type: 'image',
          imageUrl: src,
          imageCaption: caption,
          imageAlt: alt
        });
      } else {
        if (element.outerHTML.trim()) {
          blocks.push({
            id: Math.random().toString(),
            type: 'paragraph',
            text: element.outerHTML
          });
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        blocks.push({
          id: Math.random().toString(),
          type: 'paragraph',
          text: text
        });
      }
    }
  });
  
  if (blocks.length === 0) {
    blocks.push({ id: Math.random().toString(), type: 'paragraph', text: '' });
  }
  
  return blocks;
};

const convertBlocksToHtml = (blocks: Block[]): string => {
  return blocks.map(block => {
    if (block.type === 'paragraph') {
      return `<p>${block.text || ''}</p>`;
    } else if (block.type === 'heading') {
      const tag = block.headingLevel || 'h2';
      const id = tag + '-' + slugify(block.headingText || '');
      return `<${tag} id="${id}">${block.headingText || ''}</${tag}>`;
    } else if (block.type === 'image') {
      const src = block.imageUrl || '';
      const alt = block.imageAlt || '';
      const caption = block.imageCaption || '';
      return `<figure class="my-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0F172A] shadow-card-dark"><img src="${src}" alt="${alt}" class="w-full object-cover" />${caption ? `<figcaption class="border-t border-white/[0.04] px-5 py-3 text-sm text-[#94A3B8]">${caption}</figcaption>` : ''}</figure>`;
    }
    return '';
  }).join('\n');
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
  
  // Editor view states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingBlogId, setEditingBlogId] = useState('');
  const [blogForm, setBlogForm] = useState<BlogForm>(emptyBlogForm);
  const [blocks, setBlocks] = useState<Block[]>([{ id: Math.random().toString(), type: 'paragraph', text: '' }]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  // Taxonomy states
  const [categories, setCategories] = useState<{ _id: string, name: string, slug: string }[]>([]);
  const [tagsList, setTagsList] = useState<{ _id: string, name: string, slug: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<{ name: string, slug: string }>({ name: 'General', slug: 'general' });
  const [selectedTags, setSelectedTags] = useState<{ name: string, slug: string }[]>([]);
  
  const [newCatName, setNewCatName] = useState('');
  const [newTagName, setNewTagName] = useState('');

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

  const fetchCategories = async () => {
    try {
      const res = await axios.get<{ categories: any[] }>(`${API_BASE_URL}/blogs/admin/categories`, {
        params: getAuthParams()
      });
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error('Failed to load categories', err);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await axios.get<{ tags: any[] }>(`${API_BASE_URL}/blogs/admin/tags`, {
        params: getAuthParams()
      });
      setTagsList(res.data.tags || []);
    } catch (err) {
      console.error('Failed to load tags', err);
    }
  };

  useEffect(() => {
    fetchBlogs();
    fetchCategories();
    fetchTags();
  }, []);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const res = await axios.post<{ category: any }>(`${API_BASE_URL}/blogs/admin/categories`, {
        ...getAuthParams(),
        name: newCatName.trim()
      });
      setCategories(prev => [...prev, res.data.category].sort((a,b) => a.name.localeCompare(b.name)));
      setSelectedCategory({ name: res.data.category.name, slug: res.data.category.slug });
      setNewCatName('');
    } catch (err) {
      alert('Failed to add category');
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const tag = newTagName.trim();
    if (selectedTags.some(t => t.name.toLowerCase() === tag.toLowerCase())) {
      setNewTagName('');
      return;
    }
    const newTagObj = { name: tag, slug: slugify(tag) };
    setSelectedTags(prev => [...prev, newTagObj]);
    setNewTagName('');

    // Proactively post tag to server
    axios.post(`${API_BASE_URL}/blogs/admin/tags`, {
      ...getAuthParams(),
      name: tag
    }).then(() => fetchTags()).catch(() => {});
  };

  const toggleExistingTag = (tag: { name: string, slug: string }) => {
    if (selectedTags.some(t => t.slug === tag.slug)) {
      setSelectedTags(prev => prev.filter(t => t.slug !== tag.slug));
    } else {
      setSelectedTags(prev => [...prev, tag]);
    }
  };

  const openCreateEditor = () => {
    setEditingBlogId('');
    setBlogForm(emptyBlogForm);
    setBlocks([{ id: Math.random().toString(), type: 'paragraph', text: '' }]);
    setSelectedCategory({ name: 'General', slug: 'general' });
    setSelectedTags([]);
    setBlogError('');
    setBlogMessage('');
    setIsEditorOpen(true);
  };

  const resetBlogForm = () => {
    setEditingBlogId('');
    setBlogForm(emptyBlogForm);
    setBlocks([{ id: Math.random().toString(), type: 'paragraph', text: '' }]);
    setSelectedCategory({ name: 'General', slug: 'general' });
    setSelectedTags([]);
    setBlogError('');
    setBlogMessage('');
    setIsEditorOpen(false);
  };

  const startEditingBlog = async (blogId: string) => {
    setBlogError('');
    setBlogMessage('');
    setLoadingBlog(true);
    setIsEditorOpen(true);
    try {
      const response = await axios.get<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${blogId}`, {
        params: getAuthParams(),
      });
      const blog = response.data.blog;
      setEditingBlogId(blog._id);
      setBlogForm({
        title: blog.title,
        author: blog.author?.name || 'Eyeconic Editorial Team',
        youtubeUrl: blog.youtubeUrl || '',
        thumbnailUrl: blog.featuredImage?.url || '',
        featured: blog.isFeatured || false,
        published: blog.status === 'published'
      });
      setBlocks(parseHtmlToBlocks(blog.contentHtml));
      setSelectedCategory(blog.category || { name: 'General', slug: 'general' });
      setSelectedTags(blog.tags || []);
    } catch (err) {
      setBlogError('Failed to load blog details for editing.');
    } finally {
      setLoadingBlog(false);
    }
  };

  const addBlock = (type: 'paragraph' | 'heading' | 'image') => {
    const newBlock: Block = {
      id: Math.random().toString(),
      type,
      text: type === 'paragraph' ? '' : undefined,
      headingLevel: type === 'heading' ? 'h2' : undefined,
      headingText: type === 'heading' ? '' : undefined,
      imageUrl: type === 'image' ? '' : undefined,
      imageCaption: type === 'image' ? '' : undefined,
      imageAlt: type === 'image' ? '' : undefined,
    };
    setBlocks(prev => [...prev, newBlock]);
    setActiveBlockId(newBlock.id);
  };

  const deleteBlock = (id: string) => {
    if (blocks.length === 1) {
      setBlocks([{ id: Math.random().toString(), type: 'paragraph', text: '' }]);
      return;
    }
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;

    const newBlocks = [...blocks];
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[swapWith];
    newBlocks[swapWith] = temp;
    setBlocks(newBlocks);
  };

  const updateBlockValue = (id: string, fields: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...fields } : b));
  };

  const applyFormat = (blockId: string, format: 'bold' | 'italic' | 'link' | 'highlight' | 'strike' | 'sub' | 'sup') => {
    const textarea = document.getElementById(`textarea-${blockId}`) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = '';
    if (format === 'bold') {
      replacement = `<strong>${selectedText || 'bold text'}</strong>`;
    } else if (format === 'italic') {
      replacement = `<em>${selectedText || 'italic text'}</em>`;
    } else if (format === 'link') {
      const url = prompt('Enter link URL (e.g., https://example.com):', 'https://');
      if (url === null) return;
      replacement = `<a href="${url}" target="_blank" rel="noopener noreferrer">${selectedText || 'link text'}</a>`;
    } else if (format === 'highlight') {
      replacement = `<mark>${selectedText || 'highlighted text'}</mark>`;
    } else if (format === 'strike') {
      replacement = `<s>${selectedText || 'strikethrough text'}</s>`;
    } else if (format === 'sub') {
      replacement = `<sub>${selectedText || 'subscript'}</sub>`;
    } else if (format === 'sup') {
      replacement = `<sup>${selectedText || 'superscript'}</sup>`;
    }

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    
    updateBlockValue(blockId, { text: newValue });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + replacement.length);
    }, 0);
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

    const contentHtml = convertBlocksToHtml(blocks);
    const plainTextExcerpt = blocks
      .map(b => b.text || b.headingText || '')
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .slice(0, 220);

    const payload = {
      ...getAuthParams(),
      title: blogForm.title,
      contentHtml: contentHtml,
      description: plainTextExcerpt,
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
      category: selectedCategory,
      tags: selectedTags
    };

    try {
      if (editingBlogId) {
        await axios.put(`${API_BASE_URL}/blogs/admin/${editingBlogId}`, payload);
        setBlogMessage('Blog updated successfully.');
      } else {
        await axios.post(`${API_BASE_URL}/blogs/admin`, payload);
        setBlogMessage('Blog created successfully.');
      }
      setTimeout(() => {
        resetBlogForm();
        fetchBlogs();
      }, 1000);
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

  if (isEditorOpen) {
    return (
      <div className="space-y-6">
        {/* Editor Sticky Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={resetBlogForm}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#1E2A38] px-3.5 py-2 text-xs font-semibold text-[#CBD5E1] hover:bg-[#263445] hover:text-white transition duration-200"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Posts
            </button>
            <h3 className="text-xl font-bold text-white">
              {editingBlogId ? 'WordPress Block Editor' : 'WordPress Block Editor'}
            </h3>
          </div>
          <button
            onClick={submitBlog}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#18B6A4] to-[#1CC8B5] px-5 py-2.5 text-sm font-bold text-[#0A0F14] hover:shadow-[0_0_15px_rgba(24,182,164,0.35)] transition-all duration-200 disabled:opacity-60"
            disabled={submittingBlog || loadingBlog}
          >
            <Save className="w-4 h-4" />
            {submittingBlog ? 'Saving...' : editingBlogId ? 'Update Post' : 'Publish Post'}
          </button>
        </div>

        {blogError && <div className="dark-banner-error text-center text-sm font-semibold">{blogError}</div>}
        {blogMessage && <div className="dark-banner-success text-center text-sm font-semibold">{blogMessage}</div>}

        {loadingBlog ? (
          <div className="py-20 text-center text-[#94A3B8]">Loading post contents...</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* Editor Canvas Area */}
            <div className="rounded-2xl border border-white/[0.06] bg-[#151E29]/80 p-6 shadow-xl space-y-6">
              {/* Title Input */}
              <input
                type="text"
                value={blogForm.title}
                onChange={(e) => setBlogForm(curr => ({ ...curr, title: e.target.value }))}
                placeholder="Add title"
                className="w-full bg-transparent text-3xl font-extrabold text-white placeholder-white/20 border-b border-transparent focus:border-white/10 outline-none pb-3 transition"
              />

              {/* Blocks Render Stack */}
              <div className="space-y-4 pt-4 min-h-[300px]">
                {blocks.map((block, index) => {
                  const isActive = activeBlockId === block.id;
                  return (
                    <div
                      key={block.id}
                      onClick={() => setActiveBlockId(block.id)}
                      className={`relative group rounded-xl border p-4 transition-all duration-200 ${
                        isActive 
                          ? 'border-[#18B6A4] bg-[#0A0F14]/70 shadow-lg' 
                          : 'border-white/[0.04] bg-[#0A0F14]/30 hover:border-white/[0.1] hover:bg-[#0A0F14]/40'
                      }`}
                    >
                      {/* Block Hover toolbar (Up, Down, Delete) */}
                      <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1 bg-[#1F2937] border border-white/[0.08] px-1.5 py-1 rounded-lg z-10">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveBlock(index, 'up'); }}
                          disabled={index === 0}
                          className="p-1 hover:bg-[#374151] rounded text-[#CBD5E1] disabled:opacity-30"
                          title="Move block up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveBlock(index, 'down'); }}
                          disabled={index === blocks.length - 1}
                          className="p-1 hover:bg-[#374151] rounded text-[#CBD5E1] disabled:opacity-30"
                          title="Move block down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-px h-3.5 bg-white/10 mx-0.5" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }}
                          className="p-1 hover:bg-rose-950 hover:text-rose-400 rounded text-[#CBD5E1]"
                          title="Delete block"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Block Badges */}
                      <span className="absolute left-3 top-3.5 text-[9px] font-bold uppercase tracking-wider text-[#94A3B8]/60 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.04]">
                        {block.type}
                      </span>

                      <div className="mt-6">
                        {/* Paragraph Block */}
                        {block.type === 'paragraph' && (
                          <div className="space-y-2">
                            {/* Rich formatting toolbar */}
                            {isActive && (
                              <div className="flex flex-wrap items-center gap-1 bg-[#151E29] border border-white/[0.06] p-1.5 rounded-lg text-xs mb-2">
                                <button
                                  type="button"
                                  onClick={() => applyFormat(block.id, 'bold')}
                                  className="px-2.5 py-1 hover:bg-[#1E2A38] rounded text-white font-bold"
                                  title="Bold"
                                >
                                  B
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyFormat(block.id, 'italic')}
                                  className="px-2.5 py-1 hover:bg-[#1E2A38] rounded text-[#CBD5E1] hover:text-white italic"
                                  title="Italic"
                                >
                                  I
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyFormat(block.id, 'link')}
                                  className="p-1 hover:bg-[#1E2A38] rounded text-[#CBD5E1] hover:text-white"
                                  title="Link"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                </button>
                                <div className="w-px h-4 bg-white/10 mx-1" />
                                <button
                                  type="button"
                                  onClick={() => applyFormat(block.id, 'highlight')}
                                  className="px-2 py-0.5 hover:bg-[#1E2A38] rounded text-teal-400 text-[10px] font-semibold"
                                  title="Highlight text"
                                >
                                  Highlight
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyFormat(block.id, 'strike')}
                                  className="px-2 py-0.5 hover:bg-[#1E2A38] rounded text-[#CBD5E1] hover:text-white text-[10px] line-through"
                                  title="Strikethrough"
                                >
                                  abc
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyFormat(block.id, 'sub')}
                                  className="px-2 py-0.5 hover:bg-[#1E2A38] rounded text-[#CBD5E1] hover:text-white text-[10px]"
                                  title="Subscript"
                                >
                                  X<sub>2</sub>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => applyFormat(block.id, 'sup')}
                                  className="px-2 py-0.5 hover:bg-[#1E2A38] rounded text-[#CBD5E1] hover:text-white text-[10px]"
                                  title="Superscript"
                                >
                                  X<sup>2</sup>
                                </button>
                              </div>
                            )}
                            <textarea
                              id={`textarea-${block.id}`}
                              value={block.text || ''}
                              onChange={(e) => updateBlockValue(block.id, { text: e.target.value })}
                              placeholder="Type / to write narrative..."
                              className="w-full bg-transparent border-0 text-sm leading-8 text-[#CBD5E1] placeholder-white/20 outline-none resize-y min-h-[100px] focus:ring-0"
                            />
                          </div>
                        )}

                        {/* Heading Block */}
                        {block.type === 'heading' && (
                          <div className="flex gap-2 items-center">
                            <select
                              value={block.headingLevel || 'h2'}
                              onChange={(e) => updateBlockValue(block.id, { headingLevel: e.target.value as any })}
                              className="border border-[#263445] bg-[#151E29] text-white text-xs rounded-xl px-2.5 py-1.5 focus:border-[#18B6A4] outline-none"
                            >
                              <option value="h1">H1</option>
                              <option value="h2">H2</option>
                              <option value="h3">H3</option>
                            </select>
                            <input
                              type="text"
                              value={block.headingText || ''}
                              onChange={(e) => updateBlockValue(block.id, { headingText: e.target.value })}
                              placeholder="Enter heading text..."
                              className="flex-1 bg-transparent border-0 border-b border-[#263445] text-lg font-bold text-white placeholder-white/20 focus:border-[#18B6A4] outline-none py-1"
                            />
                          </div>
                        )}

                        {/* Image Block */}
                        {block.type === 'image' && (
                          <div className="space-y-3">
                            <input
                              type="url"
                              value={block.imageUrl || ''}
                              onChange={(e) => updateBlockValue(block.id, { imageUrl: e.target.value })}
                              placeholder="Paste Image URL here..."
                              className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-4 py-2.5 text-xs text-white placeholder-[#94A3B8]/60 outline-none focus:border-[#18B6A4]"
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                type="text"
                                value={block.imageAlt || ''}
                                onChange={(e) => updateBlockValue(block.id, { imageAlt: e.target.value })}
                                placeholder="Alt text (SEO)"
                                className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-3.5 py-2 text-xs text-white placeholder-[#94A3B8]/60 outline-none focus:border-[#18B6A4]"
                              />
                              <input
                                type="text"
                                value={block.imageCaption || ''}
                                onChange={(e) => updateBlockValue(block.id, { imageCaption: e.target.value })}
                                placeholder="Caption (optional)"
                                className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-3.5 py-2 text-xs text-white placeholder-[#94A3B8]/60 outline-none focus:border-[#18B6A4]"
                              />
                            </div>
                            {/* Live Image Preview */}
                            {block.imageUrl && (
                              <div className="mt-3 rounded-lg overflow-hidden border border-white/[0.04] bg-[#0A0F14] flex max-h-[220px] items-center justify-center p-2">
                                <img
                                  src={block.imageUrl}
                                  alt="Block Preview"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                  className="max-h-[200px] w-auto object-contain rounded"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Block Widget */}
              <div className="pt-6 border-t border-white/[0.04] flex items-center justify-center">
                <div className="flex items-center gap-3 bg-[#0A0F14] border border-white/[0.06] p-2 rounded-2xl shadow-inner">
                  <button
                    type="button"
                    onClick={() => addBlock('paragraph')}
                    className="flex items-center gap-1.5 px-4 py-2 hover:bg-[#1E2A38] rounded-xl text-xs text-[#CBD5E1] transition"
                  >
                    <Type className="w-3.5 h-3.5 text-teal-400" /> + Paragraph
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('heading')}
                    className="flex items-center gap-1.5 px-4 py-2 hover:bg-[#1E2A38] rounded-xl text-xs text-[#CBD5E1] transition"
                  >
                    <Type className="w-3.5 h-3.5 text-[#18B6A4] font-bold" /> + Heading
                  </button>
                  <button
                    type="button"
                    onClick={() => addBlock('image')}
                    className="flex items-center gap-1.5 px-4 py-2 hover:bg-[#1E2A38] rounded-xl text-xs text-[#CBD5E1] transition"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-teal-400" /> + Image
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar Controls Panel */}
            <div className="space-y-5">
              {/* Published Switch Card */}
              <div className="rounded-xl border border-white/[0.06] bg-[#151E29]/80 p-4 space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Status & Visibility</h4>
                <label className="flex items-center justify-between gap-3 text-xs text-[#CBD5E1] cursor-pointer bg-[#0A0F14] border border-[#263445] px-3.5 py-2.5 rounded-xl">
                  <span>Publish Immediately</span>
                  <input
                    type="checkbox"
                    checked={blogForm.published}
                    onChange={(e) => setBlogForm(curr => ({ ...curr, published: e.target.checked }))}
                    className="h-4 w-4 rounded border-[#263445] bg-[#151E29] accent-[#18B6A4]"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-[#CBD5E1] cursor-pointer bg-[#0A0F14] border border-[#263445] px-3.5 py-2.5 rounded-xl">
                  <span>Mark as Featured</span>
                  <input
                    type="checkbox"
                    checked={blogForm.featured}
                    onChange={(e) => setBlogForm(curr => ({ ...curr, featured: e.target.checked }))}
                    className="h-4 w-4 rounded border-[#263445] bg-[#151E29] accent-[#18B6A4]"
                  />
                </label>
              </div>

              {/* Author & Links Card */}
              <div className="rounded-xl border border-white/[0.06] bg-[#151E29]/80 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">Metadata Settings</h4>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] text-[#94A3B8] font-semibold mb-1">Author Name</label>
                    <input
                      type="text"
                      value={blogForm.author}
                      onChange={(e) => setBlogForm(curr => ({ ...curr, author: e.target.value }))}
                      placeholder="Author"
                      className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-3 py-2 text-xs text-white outline-none focus:border-[#18B6A4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#94A3B8] font-semibold mb-1">Featured Video (YouTube)</label>
                    <input
                      type="url"
                      value={blogForm.youtubeUrl}
                      onChange={(e) => setBlogForm(curr => ({ ...curr, youtubeUrl: e.target.value }))}
                      placeholder="YouTube URL"
                      className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-3 py-2 text-xs text-white outline-none focus:border-[#18B6A4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#94A3B8] font-semibold mb-1">Featured Image URL</label>
                    <input
                      type="url"
                      value={blogForm.thumbnailUrl}
                      onChange={(e) => setBlogForm(curr => ({ ...curr, thumbnailUrl: e.target.value }))}
                      placeholder="Image URL"
                      className="w-full rounded-xl border border-[#263445] bg-[#0A0F14] px-3 py-2 text-xs text-white outline-none focus:border-[#18B6A4]"
                    />
                  </div>
                </div>
              </div>

              {/* Categories Card */}
              <div className="rounded-xl border border-white/[0.06] bg-[#151E29]/80 p-4 space-y-3">
                <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Category</span>
                </div>
                {/* Categories List */}
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                  {categories.map((cat) => {
                    const isChecked = selectedCategory.slug === cat.slug;
                    return (
                      <label 
                        key={cat._id}
                        className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer hover:text-white"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setSelectedCategory({ name: cat.name, slug: cat.slug })}
                          className="h-3.5 w-3.5 rounded-full border-[#263445] bg-[#151E29] accent-[#18B6A4]"
                        />
                        <span>{cat.name}</span>
                      </label>
                    );
                  })}
                </div>
                {/* Dynamic Category Builder */}
                <form onSubmit={handleAddCategory} className="flex gap-1.5 pt-2 border-t border-white/[0.04]">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="New category"
                    className="flex-1 rounded-lg border border-[#263445] bg-[#0A0F14] px-2 py-1.5 text-xs text-white outline-none focus:border-[#18B6A4]"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 bg-[#1E2A38] border border-white/[0.08] hover:bg-[#263445] text-white font-bold rounded-lg text-xs"
                  >
                    +
                  </button>
                </form>
              </div>

              {/* Tags Card */}
              <div className="rounded-xl border border-white/[0.06] bg-[#151E29]/80 p-4 space-y-3">
                <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
                  <TagIcon className="w-3.5 h-3.5" />
                  <span>Tags</span>
                </div>
                
                {/* Selected Tags Display */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {selectedTags.map(tag => (
                      <span 
                        key={tag.slug}
                        onClick={() => toggleExistingTag(tag)}
                        className="inline-flex items-center gap-1 rounded bg-teal-950/60 border border-teal-800/40 px-2 py-0.5 text-[10px] text-[#4DD7C8] cursor-pointer hover:bg-red-950/60 hover:text-red-400 hover:border-red-800/40"
                        title="Click to remove"
                      >
                        {tag.name} &times;
                      </span>
                    ))}
                  </div>
                )}

                {/* New Tag Input Form */}
                <form onSubmit={handleAddTag} className="flex gap-1.5">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="Add Tag..."
                    className="flex-1 rounded-lg border border-[#263445] bg-[#0A0F14] px-2 py-1.5 text-xs text-white outline-none focus:border-[#18B6A4]"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 bg-[#1E2A38] border border-white/[0.08] hover:bg-[#263445] text-white font-bold rounded-lg text-xs"
                  >
                    Add
                  </button>
                </form>

                {/* Existing Tags suggestion list */}
                {tagsList.length > 0 && (
                  <div className="pt-2 border-t border-white/[0.04]">
                    <p className="text-[10px] text-[#94A3B8] mb-1 font-semibold">Choose from existing:</p>
                    <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                      {tagsList.filter(t => !selectedTags.some(st => st.slug === t.slug)).map(tag => (
                        <button
                          key={tag._id}
                          type="button"
                          onClick={() => toggleExistingTag(tag)}
                          className="bg-white/[0.02] border border-white/[0.04] text-[#CBD5E1] text-[9px] px-1.5 py-0.5 rounded hover:bg-[#1E2A38] hover:text-[#18B6A4]"
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // DEFAULT INVENTORY VIEW (list of all blogs)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] pb-4 gap-4">
        <div>
          <h3 className="text-xl font-bold text-white">All Blog Posts</h3>
          <p className="text-xs text-[#94A3B8] mt-0.5">Manage and edit your published articles and drafts.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCreateEditor}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#18B6A4] to-[#1CC8B5] px-4.5 py-2 text-xs font-bold text-[#0A0F14] hover:shadow-[0_0_15px_rgba(24,182,164,0.3)] transition-all duration-200"
          >
            <Plus className="w-3.5 h-3.5" /> Create New Post
          </button>
          <button
            onClick={fetchBlogs}
            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#1E2A38] px-3.5 py-2 text-xs font-semibold text-[#CBD5E1] hover:bg-[#263445] hover:text-white transition duration-200"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh List
          </button>
        </div>
      </div>

      {blogError && <div className="dark-banner-error text-center text-sm font-semibold">{blogError}</div>}
      {blogMessage && <div className="dark-banner-success text-center text-sm font-semibold">{blogMessage}</div>}

      {loading ? (
        <div className="py-20 text-center text-[#94A3B8]">Loading blog posts...</div>
      ) : blogs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-24 text-center text-sm text-[#94A3B8]">
          No blogs found. Click the button above to publish your first post!
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {blogs.map((blog) => (
            <article
              key={blog._id}
              className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#151E29] transition hover:border-[#18B6A4]/20 flex flex-col justify-between"
            >
              <div className="flex flex-col sm:flex-row h-full">
                {/* Thumbnail */}
                <div className="h-36 sm:h-full sm:w-40 bg-[#0F172A] flex-shrink-0 relative overflow-hidden">
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
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#CBD5E1]">
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
                    <p className="mt-1 text-xs text-[#94A3B8] line-clamp-2 leading-relaxed">{blog.excerpt}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.04] pt-3">
                    <span className="text-xs text-[#64748B]">By {blog.author?.name || 'Unknown'}</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditingBlog(blog._id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#1E2A38] px-2.5 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-[#18B6A4] hover:text-[#18B6A4] transition duration-200"
                      >
                        <PencilLine className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFeature(blog)}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#1E2A38] px-2 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-amber-500 hover:text-amber-500 transition duration-200"
                        title="Toggle Featured"
                      >
                        <Star className={`w-3.5 h-3.5 ${blog.isFeatured ? 'fill-current text-amber-500' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBlog(blog._id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-950/20 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-950/40 hover:text-red-300 transition duration-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <Link
                        to={`/blog/${blog.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#1E2A38] px-2.5 py-1.5 text-xs font-semibold text-[#CBD5E1] hover:border-[#18B6A4] hover:text-[#18B6A4] transition duration-200"
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
  );
};

export default BlogCmsPanel;