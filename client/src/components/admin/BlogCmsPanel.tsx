import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import type { JSONContent } from '@tiptap/react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  PencilLine,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';
import { getAdminAuthHeaders } from '../../lib/adminAuth';
import type { BlogDocument, BlogDashboardResponse, BlogSummary, TaxonomyItem } from '../../types/blog';
import { generateSlug } from '../../lib/slug';
import { analyzeAccessibility, analyzeSeoTips } from '../../lib/contentChecks';
import { renderBlogContentHtml } from '../../lib/renderBlogContent';
import { RichEditor, emptyDoc, type EditorChangePayload, type RichEditorHandle } from './editor/RichEditor';
import { MediaPicker, type MediaPickerMode, type MediaPickerSelection } from './MediaPicker';
import { ConfirmDialog } from './ConfirmDialog';

const LOCAL_DRAFT_KEY = 'eyeconic_editor_draft';
const getAuthHeaders = () => getAdminAuthHeaders();

type StatusFilter = 'all' | 'draft' | 'published' | 'scheduled' | 'archived' | 'featured';
type SortKey = 'updatedAt' | 'createdAt' | 'title' | 'publishAt';

interface EditorForm {
  title: string;
  slug: string;
  author: string;
  status: 'draft' | 'published' | 'scheduled' | 'archived';
  isFeatured: boolean;
  scheduledFor: string;
  expiresAt: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  thumbnailAlt: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  noIndex: boolean;
  categorySlug: string;
  categoryName: string;
  tags: string[];
}

const defaultForm = (): EditorForm => ({
  title: '',
  slug: '',
  author: 'EyeConic Editorial Team',
  status: 'draft',
  isFeatured: false,
  scheduledFor: '',
  expiresAt: '',
  youtubeUrl: '',
  thumbnailUrl: '',
  thumbnailAlt: '',
  metaTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  ogImageUrl: '',
  noIndex: false,
  categorySlug: 'general',
  categoryName: 'General',
  tags: [],
});

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'published':
      return 'bg-[#18B6A4]/20 text-[#4DD7C8] border-[#18B6A4]/30';
    case 'scheduled':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'archived':
      return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    default:
      return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
  }
}

const BlogCmsPanel: React.FC = () => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [blogs, setBlogs] = useState<BlogSummary[]>([]);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [availableTags, setAvailableTags] = useState<TaxonomyItem[]>([]);
  const [summary, setSummary] = useState<BlogDashboardResponse['summary'] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<EditorForm>(defaultForm());
  const [slugTouched, setSlugTouched] = useState(false);
  const [content, setContent] = useState<JSONContent>(emptyDoc());
  const [stats, setStats] = useState({ wordCount: 0, characterCount: 0, html: '' });
  const [previewMode, setPreviewMode] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [revisions, setRevisions] = useState<
    Array<{ id: string; title: string; summary: string; savedAt: string; status: string }>
  >([]);
  const [tagInput, setTagInput] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<MediaPickerMode>('insert');
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    action: (() => void) | null;
  }>({ open: false, title: '', message: '', confirmLabel: 'Confirm', action: null });

  const editorRef = useRef<RichEditorHandle>(null);
  const dirtyRef = useRef(false);
  const editingIdRef = useRef<string | null>(null);
  const formRef = useRef(form);
  const contentRef = useRef(content);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, sort, order]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string | number | boolean> = {
        page,
        limit,
        sort,
        order,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter === 'featured') params.featured = 'true';
      else if (statusFilter !== 'all') params.status = statusFilter;

      const res = await axios.get<BlogDashboardResponse>(`${API_BASE_URL}/blogs/admin`, {
        params,
        headers: getAuthHeaders(),
      });
      setBlogs(res.data.blogs || []);
      setTotal(res.data.total || 0);
      setSummary(res.data.summary || null);
      setCategories(res.data.categories || []);
      setAvailableTags(res.data.tags || []);
    } catch (err) {
      setBlogs([]);
      setError(axios.isAxiosError(err) ? err.response?.data?.msg || 'Unable to load blogs.' : 'Unable to load blogs.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, sort, order, debouncedSearch, statusFilter]);

  useEffect(() => {
    if (!isEditorOpen) loadList();
  }, [isEditorOpen, loadList]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const markDirty = () => setDirty(true);

  const onEditorChange = (payload: EditorChangePayload) => {
    setContent(payload.json);
    setStats({
      wordCount: payload.wordCount,
      characterCount: payload.characterCount,
      html: payload.html,
    });
    markDirty();
  };

  const openCreate = () => {
    const base = defaultForm();
    let initialContent = emptyDoc();
    let notice = '';
    try {
      const raw = localStorage.getItem(LOCAL_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.form) Object.assign(base, parsed.form);
        if (parsed?.content?.type === 'doc') initialContent = parsed.content;
        notice = 'Recovered local draft from this browser.';
      }
    } catch {
      /* ignore corrupt draft */
    }

    setEditingId(null);
    setForm(base);
    setSlugTouched(Boolean(base.slug));
    setContent(initialContent);
    setStats({
      wordCount: 0,
      characterCount: 0,
      html: renderBlogContentHtml(initialContent),
    });
    setPreviewMode(false);
    setRevisions([]);
    setDraftNotice(notice);
    setDirty(false);
    setMessage('');
    setError('');
    setIsEditorOpen(true);
  };

  const openEdit = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${id}`, {
        headers: getAuthHeaders(),
      });
      const blog = res.data.blog;
      const nextForm: EditorForm = {
        title: blog.title || '',
        slug: blog.slug || '',
        author: blog.author?.name || 'EyeConic Editorial Team',
        status: (['draft', 'published', 'scheduled', 'archived'].includes(blog.status)
          ? blog.status
          : 'draft') as EditorForm['status'],
        isFeatured: Boolean(blog.isFeatured),
        scheduledFor: toDatetimeLocal(blog.scheduledFor),
        expiresAt: toDatetimeLocal(blog.expiresAt),
        youtubeUrl: (blog as BlogDocument & { youtubeUrl?: string }).youtubeUrl || '',
        thumbnailUrl: blog.featuredImage?.url || '',
        thumbnailAlt: blog.featuredImage?.altText || '',
        metaTitle: blog.seo?.metaTitle || blog.seo?.seoTitle || '',
        metaDescription: blog.seo?.metaDescription || '',
        canonicalUrl: blog.seo?.canonicalUrl || '',
        ogImageUrl: blog.seo?.openGraph?.image || '',
        noIndex: blog.seo?.robotsIndex === false,
        categorySlug: blog.category?.slug || 'general',
        categoryName: blog.category?.name || 'General',
        tags: (blog.tags || []).map((t) => t.name).filter(Boolean),
      };

      let nextContent: JSONContent = emptyDoc();
      let notice = '';
      const draftBag = (blog as BlogDocument & { draft?: { title?: string; contentBlocks?: JSONContent; savedAt?: string } }).draft;
      if (draftBag?.contentBlocks?.type === 'doc' && draftBag.savedAt) {
        nextContent = draftBag.contentBlocks;
        if (draftBag.title) nextForm.title = draftBag.title;
        notice = `Recovered server draft from ${formatDate(draftBag.savedAt)}.`;
      } else if (blog.contentBlocks && !Array.isArray(blog.contentBlocks) && (blog.contentBlocks as JSONContent).type === 'doc') {
        nextContent = blog.contentBlocks as JSONContent;
      }

      setEditingId(blog._id);
      setForm(nextForm);
      setSlugTouched(true);
      setContent(nextContent);
      setStats({
        wordCount: blog.wordCount || 0,
        characterCount: 0,
        html: blog.contentHtml || renderBlogContentHtml(nextContent),
      });
      setPreviewMode(false);
      setDraftNotice(notice);
      setDirty(false);
      setMessage('');
      setIsEditorOpen(true);

      const rev = await axios.get<{ revisions: typeof revisions }>(
        `${API_BASE_URL}/blogs/admin/${id}/revisions`,
        { headers: getAuthHeaders() },
      );
      setRevisions(rev.data.revisions || []);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.msg || 'Unable to load post.' : 'Unable to load post.');
    } finally {
      setLoading(false);
    }
  };

  const requestCloseEditor = () => {
    if (!dirty) {
      setIsEditorOpen(false);
      return;
    }
    setConfirm({
      open: true,
      title: 'Discard unsaved changes?',
      message: 'You have unsaved changes. Leave the editor and discard them?',
      action: () => {
        setDirty(false);
        setIsEditorOpen(false);
        setConfirm((c) => ({ ...c, open: false }));
      },
    });
  };

  const buildPayload = (statusOverride?: EditorForm['status']) => {
    const f = formRef.current;
    const status = statusOverride || f.status;
    return {
      title: f.title.trim(),
      slug: f.slug.trim() || generateSlug(f.title),
      author: { name: f.author.trim() || 'EyeConic Editorial Team' },
      status,
      isFeatured: f.isFeatured,
      scheduledFor: status === 'scheduled' && f.scheduledFor ? new Date(f.scheduledFor).toISOString() : null,
      expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null,
      youtubeUrl: f.youtubeUrl.trim(),
      featuredImage: {
        url: f.thumbnailUrl.trim(),
        altText: f.thumbnailAlt.trim() || f.title.trim(),
        title: f.title.trim(),
      },
      thumbnailUrl: f.thumbnailUrl.trim(),
      category: { name: f.categoryName, slug: f.categorySlug },
      tags: f.tags.map((name) => ({ name })),
      contentBlocks: contentRef.current,
      seo: {
        metaTitle: f.metaTitle.trim() || f.title.trim(),
        seoTitle: f.metaTitle.trim() || f.title.trim(),
        metaDescription: f.metaDescription.trim().slice(0, 160),
        canonicalUrl: f.canonicalUrl.trim(),
        customSlug: f.slug.trim(),
        robotsIndex: !f.noIndex,
        ogImageUrl: f.ogImageUrl.trim() || f.thumbnailUrl.trim(),
        openGraph: {
          image: f.ogImageUrl.trim() || f.thumbnailUrl.trim(),
        },
      },
    };
  };

  const savePost = async (statusOverride?: EditorForm['status']) => {
    const title = form.title.trim();
    if (!title) {
      setError('Title is required.');
      return;
    }
    if ((statusOverride || form.status) === 'scheduled' && !form.scheduledFor) {
      setError('Scheduled posts require a publish date and time.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = buildPayload(statusOverride);
      let blog: BlogDocument;
      if (editingId) {
        const res = await axios.put<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${editingId}`, payload, {
          headers: getAuthHeaders(),
        });
        blog = res.data.blog;
      } else {
        const res = await axios.post<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin`, payload, {
          headers: getAuthHeaders(),
        });
        blog = res.data.blog;
        setEditingId(blog._id);
        localStorage.removeItem(LOCAL_DRAFT_KEY);
      }

      if (statusOverride) {
        setForm((prev) => ({ ...prev, status: statusOverride, slug: blog.slug || prev.slug }));
      } else {
        setForm((prev) => ({ ...prev, slug: blog.slug || prev.slug }));
      }

      setDirty(false);
      setDraftNotice('');
      setAutosaveStatus('Saved');
      setMessage(
        (statusOverride || form.status) === 'published'
          ? 'Post published.'
          : (statusOverride || form.status) === 'scheduled'
            ? 'Post scheduled.'
            : 'Draft saved.',
      );

      const rev = await axios.get<{ revisions: typeof revisions }>(
        `${API_BASE_URL}/blogs/admin/${blog._id}/revisions`,
        { headers: getAuthHeaders() },
      );
      setRevisions(rev.data.revisions || []);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.msg || 'Unable to save post.' : 'Unable to save post.');
    } finally {
      setSaving(false);
    }
  };

  // Local + server autosave
  useEffect(() => {
    if (!isEditorOpen) return;
    const timer = window.setInterval(async () => {
      const f = formRef.current;
      const c = contentRef.current;
      const hasContent = Boolean(f.title.trim()) || JSON.stringify(c).length > 40;
      if (!hasContent) return;

      try {
        localStorage.setItem(
          LOCAL_DRAFT_KEY,
          JSON.stringify({ form: f, content: c, savedAt: new Date().toISOString() }),
        );
      } catch {
        /* quota */
      }

      const id = editingIdRef.current;
      if (!id) {
        setAutosaveStatus('Draft saved locally');
        return;
      }

      setAutosaveStatus('Saving…');
      try {
        await axios.put(`${API_BASE_URL}/blogs/admin/${id}/draft`, {
          title: f.title,
          contentBlocks: c,
        }, { headers: getAuthHeaders() });
        setAutosaveStatus('Draft saved');
        window.setTimeout(() => setAutosaveStatus((s) => (s === 'Draft saved' ? '' : s)), 2500);
      } catch {
        setAutosaveStatus('Autosave failed');
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [isEditorOpen]);

  const togglePublish = async (blog: BlogSummary) => {
    const nextPublished = blog.status !== 'published';
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/blogs/admin/${blog._id}/status`,
        { published: nextPublished },
        { headers: getAuthHeaders() },
      );
      setBlogs((prev) => prev.map((b) => (b._id === blog._id ? { ...b, ...res.data.blog } : b)));
      setMessage(nextPublished ? 'Post published.' : 'Post set to draft.');
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.msg || 'Unable to update status.' : 'Unable to update status.');
    }
  };

  const deleteBlog = (blog: BlogSummary) => {
    setConfirm({
      open: true,
      title: 'Delete blog post?',
      message: `Permanently delete “${blog.title}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      action: async () => {
        try {
          await axios.delete(`${API_BASE_URL}/blogs/admin/${blog._id}`, { headers: getAuthHeaders() });
          setBlogs((prev) => prev.filter((b) => b._id !== blog._id));
          setMessage('Blog deleted.');
        } catch (err) {
          setError(axios.isAxiosError(err) ? err.response?.data?.msg || 'Unable to delete.' : 'Unable to delete.');
        } finally {
          setConfirm((c) => ({ ...c, open: false }));
        }
      },
    });
  };

  const restoreRevision = (revisionId: string) => {
    if (!editingId) return;
    setConfirm({
      open: true,
      title: 'Restore revision?',
      message: 'Current content will be snapshotted first, then this revision will become the live editor content.',
      confirmLabel: 'Restore',
      action: async () => {
        try {
          const res = await axios.post<{ blog: BlogDocument }>(
            `${API_BASE_URL}/blogs/admin/${editingId}/revisions/${revisionId}/restore`,
            {},
            { headers: getAuthHeaders() },
          );
          const blog = res.data.blog;
          const blocks =
            blog.contentBlocks && !Array.isArray(blog.contentBlocks) && (blog.contentBlocks as JSONContent).type === 'doc'
              ? (blog.contentBlocks as JSONContent)
              : emptyDoc();
          setForm((prev) => ({ ...prev, title: blog.title, slug: blog.slug }));
          setContent(blocks);
          setStats({
            wordCount: blog.wordCount || 0,
            characterCount: 0,
            html: blog.contentHtml || renderBlogContentHtml(blocks),
          });
          setDirty(true);
          setMessage('Revision restored successfully.');
          const rev = await axios.get<{ revisions: typeof revisions }>(
            `${API_BASE_URL}/blogs/admin/${editingId}/revisions`,
            { headers: getAuthHeaders() },
          );
          setRevisions(rev.data.revisions || []);
        } catch (err) {
          setError(axios.isAxiosError(err) ? err.response?.data?.msg || 'Unable to restore.' : 'Unable to restore.');
        } finally {
          setConfirm((c) => ({ ...c, open: false }));
        }
      },
    });
  };

  const handleMediaSelect = (selection: MediaPickerSelection) => {
    if (mediaMode === 'cover') {
      setForm((prev) => ({
        ...prev,
        thumbnailUrl: selection.url,
        thumbnailAlt: selection.alt || prev.thumbnailAlt,
      }));
      markDirty();
    } else if (mediaMode === 'replace') {
      editorRef.current?.replaceImage({
        src: selection.url,
        alt: selection.alt,
        caption: selection.caption,
        width: selection.width,
        height: selection.height,
      });
      markDirty();
    } else {
      editorRef.current?.insertImage({
        src: selection.url,
        alt: selection.alt,
        caption: selection.caption,
        width: selection.width,
        height: selection.height,
      });
      markDirty();
    }
    setMediaOpen(false);
  };

  const addTag = (raw: string) => {
    const name = raw.trim().toLowerCase();
    if (!name) return;
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(name) ? prev.tags : [...prev.tags, name],
    }));
    setTagInput('');
    markDirty();
  };

  const a11yIssues = useMemo(() => analyzeAccessibility(content), [content]);
  const seoTips = useMemo(
    () =>
      analyzeSeoTips({
        title: form.title,
        slug: form.slug,
        metaDescription: form.metaDescription,
        wordCount: stats.wordCount,
      }),
    [form.title, form.slug, form.metaDescription, stats.wordCount],
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const readingMinutes = Math.max(1, Math.ceil(stats.wordCount / 220));

  const filterChips: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'draft', label: 'Draft' },
    { id: 'published', label: 'Published' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'archived', label: 'Archived' },
    { id: 'featured', label: 'Featured' },
  ];

  /* ===================== LIST ===================== */
  if (!isEditorOpen) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">All Blog Posts</h2>
            <p className="mt-1 text-sm text-[#94A3B8]">Manage and edit your published articles and drafts.</p>
            {summary ? (
              <p className="mt-2 text-xs text-[#64748B]">
                {summary.totalPosts} posts · {summary.published} published · {summary.drafts} drafts · {summary.scheduled}{' '}
                scheduled
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#18B6A4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1CC8B5]"
            >
              <Plus className="h-4 w-4" />
              Create New Post
            </button>
            <button
              type="button"
              onClick={() => loadList()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#151E29] px-4 py-2.5 text-sm font-medium text-white transition hover:border-[#18B6A4]/40"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh List
            </button>
          </div>
        </div>

        {(error || message) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-[#18B6A4]/30 bg-[#18B6A4]/10 text-[#4DD7C8]'
            }`}
            role="status"
          >
            {error || message}
          </div>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, slug, author, tags…"
              className="w-full rounded-xl border border-white/10 bg-[#0F172A] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-[#64748B] focus:border-[#18B6A4]/50 focus:outline-none"
            />
          </div>
          <select
            value={`${sort}:${order}`}
            onChange={(e) => {
              const [s, o] = e.target.value.split(':') as [SortKey, 'asc' | 'desc'];
              setSort(s);
              setOrder(o);
            }}
            className="rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2.5 text-sm text-white"
            aria-label="Sort posts"
          >
            <option value="updatedAt:desc">Recently updated</option>
            <option value="createdAt:desc">Newest</option>
            <option value="createdAt:asc">Oldest</option>
            <option value="title:asc">Title A–Z</option>
            <option value="publishAt:desc">Publish date</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === chip.id
                  ? 'border-[#18B6A4] bg-[#18B6A4]/15 text-[#4DD7C8]'
                  : 'border-white/10 bg-[#151E29] text-[#94A3B8] hover:border-white/20'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-[#94A3B8]">Loading blogs…</div>
        ) : blogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-[#0F172A]/60 px-6 py-16 text-center text-[#94A3B8]">
            No blogs found. Click the button above to publish your first post!
          </div>
        ) : (
          <div className="space-y-4">
            {blogs.map((blog) => (
              <article
                key={blog._id}
                className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-[#151E29] p-4 shadow-card-dark md:flex-row"
              >
                <div className="h-36 w-full shrink-0 overflow-hidden rounded-xl bg-[#0A0F14] md:h-28 md:w-44">
                  {blog.featuredImage?.url ? (
                    <img src={blog.featuredImage.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[#64748B]">No thumbnail</div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusBadgeClass(blog.status)}`}>
                      {blog.status}
                    </span>
                    {blog.isFeatured ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#18B6A4]/30 bg-[#18B6A4]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#4DD7C8]">
                        <Star className="h-3 w-3" /> Featured
                      </span>
                    ) : null}
                    <span className="text-xs text-[#64748B]">{formatDate(blog.createdAt)}</span>
                    {blog.readingTimeMinutes ? (
                      <span className="text-xs text-[#64748B]">{blog.readingTimeMinutes} min read</span>
                    ) : null}
                  </div>
                  <h3 className="truncate text-lg font-semibold text-white">{blog.title}</h3>
                  <p className="text-sm text-[#94A3B8]">By {blog.author?.name || 'EyeConic'}</p>
                  {blog.slug ? (
                    <p className="truncate text-xs text-[#64748B]">/blog/{blog.slug}</p>
                  ) : null}
                  {blog.excerpt ? <p className="line-clamp-2 text-sm text-[#CBD5E1]">{blog.excerpt}</p> : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => openEdit(blog._id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:border-[#18B6A4]/40"
                    >
                      <PencilLine className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePublish(blog)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:border-[#18B6A4]/40"
                    >
                      {blog.status === 'published' ? 'Unpublish' : 'Publish'}
                    </button>
                    {blog.status === 'published' && blog.slug ? (
                      <Link
                        to={`/blog/${blog.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:border-[#18B6A4]/40"
                      >
                        <Eye className="h-3.5 w-3.5" /> Preview
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => deleteBlog(blog)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-[#64748B]">
              Page {page} of {totalPages} · {total} posts
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        <ConfirmDialog
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          danger
          confirmLabel={confirm.confirmLabel || 'Delete'}
          onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
          onConfirm={() => confirm.action?.()}
        />
      </div>
    );
  }

  /* ===================== EDITOR ===================== */
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={requestCloseEditor}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:border-[#18B6A4]/40"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Posts
          </button>
          <div>
            <h2 className="text-lg font-semibold text-white">{editingId ? 'Edit Post' : 'New Post'}</h2>
            <p className="text-xs text-[#64748B]" aria-live="polite">
              {autosaveStatus || (dirty ? 'Unsaved changes' : 'All changes saved')}
              {' · '}
              {stats.wordCount} words · {readingMinutes} min read
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPreviewMode((p) => !p)}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-white hover:border-[#18B6A4]/40"
          >
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => savePost('draft')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> Save Draft
          </button>
          {form.status === 'scheduled' || form.scheduledFor ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => savePost('scheduled')}
              className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-200 disabled:opacity-60"
            >
              Schedule
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => savePost('published')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#18B6A4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1CC8B5] disabled:opacity-60"
          >
            Publish
          </button>
        </div>
      </div>

      {(error || message || draftNotice) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? 'border-red-500/30 bg-red-500/10 text-red-200'
              : draftNotice && !message
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                : 'border-[#18B6A4]/30 bg-[#18B6A4]/10 text-[#4DD7C8]'
          }`}
          role="status"
        >
          {error || message || draftNotice}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <input
            value={form.title}
            onChange={(e) => {
              const title = e.target.value;
              setForm((prev) => ({
                ...prev,
                title,
                slug: slugTouched ? prev.slug : generateSlug(title),
                metaTitle: prev.metaTitle || title,
              }));
              markDirty();
            }}
            placeholder="Add title"
            className="w-full border-0 bg-transparent text-3xl font-bold text-white placeholder:text-[#475569] focus:outline-none md:text-4xl"
          />

          {previewMode ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#0F172A] p-6">
              {stats.html || form.title ? (
                <article>
                  <h1 className="mb-6 text-3xl font-bold text-white">{form.title || 'Untitled'}</h1>
                  {form.thumbnailUrl ? (
                    <img src={form.thumbnailUrl} alt={form.thumbnailAlt || form.title} className="mb-6 max-h-80 w-full rounded-2xl object-cover" />
                  ) : null}
                  <div className="blog-prose" dangerouslySetInnerHTML={{ __html: stats.html || renderBlogContentHtml(content) }} />
                </article>
              ) : (
                <p className="text-center text-[#94A3B8]">Nothing to preview yet.</p>
              )}
            </div>
          ) : (
            <RichEditor
              ref={editorRef}
              content={content}
              onChange={onEditorChange}
              onRequestImage={(mode) => {
                setMediaMode(mode === 'replace' ? 'replace' : 'insert');
                setMediaOpen(true);
              }}
            />
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Status & Visibility</h3>
            <label className="mb-2 block text-xs text-[#94A3B8]">Status</label>
            <select
              value={form.status}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, status: e.target.value as EditorForm['status'] }));
                markDirty();
              }}
              className="mb-3 w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
              <option value="archived">Archived</option>
            </select>
            {form.status === 'scheduled' ? (
              <div className="mb-3 space-y-2">
                <label className="block text-xs text-[#94A3B8]">Publish date & time</label>
                <input
                  type="datetime-local"
                  value={form.scheduledFor}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, scheduledFor: e.target.value }));
                    markDirty();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
                />
              </div>
            ) : null}
            <div className="mb-3 space-y-2">
              <label className="block text-xs text-[#94A3B8]">Expires at (optional)</label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, expiresAt: e.target.value }));
                  markDirty();
                }}
                className="w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#CBD5E1]">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, isFeatured: e.target.checked }));
                  markDirty();
                }}
                className="rounded border-white/20 bg-[#0F172A] text-[#18B6A4] focus:ring-[#18B6A4]"
              />
              Mark as Featured
            </label>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Featured Media</h3>
            {form.thumbnailUrl ? (
              <img src={form.thumbnailUrl} alt="" className="mb-3 h-32 w-full rounded-xl object-cover" />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMediaMode('cover');
                  setMediaOpen(true);
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:border-[#18B6A4]/40"
              >
                Choose cover
              </button>
              {form.thumbnailUrl ? (
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, thumbnailUrl: '', thumbnailAlt: '' }));
                    markDirty();
                  }}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#94A3B8]"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <label className="mt-3 block text-xs text-[#94A3B8]">Cover image URL</label>
            <input
              value={form.thumbnailUrl}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, thumbnailUrl: e.target.value }));
                markDirty();
              }}
              placeholder="Image URL"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <label className="mt-3 block text-xs text-[#94A3B8]">Featured Video (YouTube)</label>
            <input
              value={form.youtubeUrl}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, youtubeUrl: e.target.value }));
                markDirty();
              }}
              placeholder="YouTube URL"
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Metadata</h3>
            <label className="block text-xs text-[#94A3B8]">Author Name</label>
            <input
              value={form.author}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, author: e.target.value }));
                markDirty();
              }}
              className="mt-1 mb-3 w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <label className="block text-xs text-[#94A3B8]">Slug</label>
            <input
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm((prev) => ({ ...prev, slug: generateSlug(e.target.value) }));
                markDirty();
              }}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <p className="mt-1 text-[11px] text-[#64748B]">eyeconicneetpg.com/blog/{form.slug || '…'}</p>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">SEO</h3>
            <label className="block text-xs text-[#94A3B8]">Meta title</label>
            <input
              value={form.metaTitle}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, metaTitle: e.target.value.slice(0, 70) }));
                markDirty();
              }}
              className="mt-1 mb-1 w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <p className="mb-3 text-[11px] text-[#64748B]">{form.metaTitle.length}/70</p>
            <label className="block text-xs text-[#94A3B8]">Meta description</label>
            <textarea
              value={form.metaDescription}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, metaDescription: e.target.value.slice(0, 160) }));
                markDirty();
              }}
              rows={3}
              className="mt-1 mb-1 w-full rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
            />
            <p className="mb-3 text-[11px] text-[#64748B]">{form.metaDescription.length}/160</p>
            <div className="rounded-xl border border-white/10 bg-[#0A0F14] p-3 text-sm">
              <p className="text-xs text-[#64748B]">EyeConic NEET PG</p>
              <p className="truncate font-medium text-[#4DD7C8]">{form.metaTitle || form.title || 'Page title'}</p>
              <p className="truncate text-xs text-emerald-500/80">
                eyeconicneetpg.com/blog/{form.slug || 'slug'}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-[#94A3B8]">
                {form.metaDescription || 'Your meta description…'}
              </p>
            </div>
            {seoTips.filter((t) => t.id !== 'seo-ok').length ? (
              <ul className="mt-3 space-y-1 text-xs text-[#94A3B8]">
                {seoTips
                  .filter((t) => t.id !== 'seo-ok')
                  .map((tip) => (
                    <li key={tip.id}>• {tip.message}</li>
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-[#4DD7C8]">SEO looks solid.</p>
            )}
            <label className="mt-3 flex items-center gap-2 text-sm text-[#CBD5E1]">
              <input
                type="checkbox"
                checked={form.noIndex}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, noIndex: e.target.checked }));
                  markDirty();
                }}
                className="rounded border-white/20 bg-[#0F172A] text-[#18B6A4]"
              />
              No-index this post
            </label>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Accessibility</h3>
            {a11yIssues.length === 0 ? (
              <p className="text-xs text-[#4DD7C8]">No accessibility issues detected.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {a11yIssues.map((issue, i) => (
                  <li
                    key={`${issue.id}-${i}`}
                    className={
                      issue.severity === 'error'
                        ? 'text-red-300'
                        : issue.severity === 'warning'
                          ? 'text-amber-200'
                          : 'text-[#94A3B8]'
                    }
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Category</h3>
            <div className="mb-3 max-h-32 space-y-1 overflow-y-auto">
              {(categories.length ? categories : [{ name: 'General', slug: 'general' }]).map((cat) => (
                <label key={cat.slug} className="flex items-center gap-2 text-sm text-[#CBD5E1]">
                  <input
                    type="checkbox"
                    checked={form.categorySlug === cat.slug}
                    onChange={() => {
                      setForm((prev) => ({ ...prev, categorySlug: cat.slug, categoryName: cat.name }));
                      markDirty();
                    }}
                    className="rounded border-white/20 bg-[#0F172A] text-[#18B6A4]"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                placeholder="New category"
                className="flex-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const name = (e.target as HTMLInputElement).value.trim();
                  if (!name) return;
                  try {
                    const res = await axios.post(
                      `${API_BASE_URL}/blogs/admin/categories`,
                      { name },
                      { headers: getAuthHeaders() },
                    );
                    const cat = res.data.category;
                    setCategories((prev) => [...prev, cat]);
                    setForm((prev) => ({ ...prev, categorySlug: cat.slug, categoryName: cat.name }));
                    (e.target as HTMLInputElement).value = '';
                    markDirty();
                  } catch {
                    setError('Unable to create category.');
                  }
                }}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Tags</h3>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {form.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
                    markDirty();
                  }}
                  className="rounded-full border border-[#18B6A4]/30 bg-[#18B6A4]/10 px-2.5 py-0.5 text-xs text-[#4DD7C8]"
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                list="eyeconic-tag-suggestions"
                placeholder="Add tag…"
                className="flex-1 rounded-xl border border-white/10 bg-[#0F172A] px-3 py-2 text-sm text-white"
              />
              <datalist id="eyeconic-tag-suggestions">
                {availableTags.map((t) => (
                  <option key={t.slug} value={t.name} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                className="rounded-xl bg-[#18B6A4] px-3 py-2 text-xs font-semibold text-white"
              >
                Add
              </button>
            </div>
          </section>

          {editingId ? (
            <section className="rounded-2xl border border-white/[0.06] bg-[#151E29] p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Revisions</h3>
              {revisions.length === 0 ? (
                <p className="text-xs text-[#94A3B8]">No revisions yet.</p>
              ) : (
                <ul className="space-y-2">
                  {revisions.slice(0, 8).map((rev) => (
                    <li key={rev.id} className="rounded-xl border border-white/5 bg-[#0F172A] p-2.5">
                      <p className="text-xs font-medium text-white">{rev.summary || rev.title}</p>
                      <p className="text-[11px] text-[#64748B]">{formatDate(rev.savedAt)} · {rev.status}</p>
                      <button
                        type="button"
                        onClick={() => restoreRevision(rev.id)}
                        className="mt-1.5 text-[11px] font-semibold text-[#4DD7C8] hover:underline"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </aside>
      </div>

      <MediaPicker open={mediaOpen} mode={mediaMode} onClose={() => setMediaOpen(false)} onSelect={handleMediaSelect} />
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        danger={confirm.confirmLabel !== 'Restore'}
        confirmLabel={confirm.confirmLabel || 'Confirm'}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
        onConfirm={() => confirm.action?.()}
      />
    </div>
  );
};

export default BlogCmsPanel;
