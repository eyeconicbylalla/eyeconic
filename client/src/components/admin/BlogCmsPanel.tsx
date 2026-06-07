import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Archive,
  BarChart3,
  Bold,
  CalendarClock,
  CheckSquare,
  Code2,
  Copy,
  Eye,
  FilePlus2,
  Flame,
  Globe,
  Heading,
  Highlighter,
  ImagePlus,
  Info,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  Pin,
  Quote,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Table2,
  Tags,
  Trash2,
  Underline,
  UploadCloud,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';
import BlogArticleContent from '../blog/BlogArticleContent';
import type {
  BlogAnalytics,
  BlogAuditLog,
  BlogAuthor,
  BlogComment,
  BlogDashboardResponse,
  BlogDocument,
  BlogMedia,
  BlogOutlineItem,
  BlogSeo,
  BlogSummary,
  BlogVersion,
  TaxonomyItem,
} from '../../types/blog';

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';

const statusOptions: Array<BlogSummary['status']> = ['draft', 'review', 'published', 'scheduled', 'archived'];
const visibilityOptions: Array<BlogSummary['visibility']> = ['public', 'private', 'premium'];
const schemaOptions = ['Article', 'BlogPosting', 'FAQ', 'Breadcrumb', 'HowTo', 'Review'];
const workspaceTabs = ['editor', 'seo', 'media', 'taxonomy', 'comments', 'analytics'] as const;
const bulkActions = [
  { label: 'Bulk publish', value: 'published' },
  { label: 'Move to review', value: 'review' },
  { label: 'Revert to draft', value: 'draft' },
  { label: 'Archive selected', value: 'archived' },
  { label: 'Feature selected', value: 'feature' },
  { label: 'Unfeature selected', value: 'unfeature' },
  { label: 'Delete selected', value: 'delete' },
];

interface EditableBlog {
  _id?: string;
  title: string;
  subtitle: string;
  excerpt: string;
  slug: string;
  contentHtml: string;
  contentBlocks: Array<Record<string, unknown>>;
  customHtmlBlocks: string[];
  outline: BlogOutlineItem[];
  author: BlogAuthor;
  coAuthors: string[];
  category: TaxonomyItem;
  tags: TaxonomyItem[];
  featuredImage: BlogMedia;
  gallery: BlogMedia[];
  embeds: Array<Record<string, unknown>>;
  status: BlogSummary['status'];
  visibility: BlogSummary['visibility'];
  isFeatured: boolean;
  isPinned: boolean;
  allowComments: boolean;
  publishAt: string;
  scheduledFor: string;
  seo: BlogSeo;
  analytics: BlogAnalytics;
  comments: BlogComment[];
  versions: BlogVersion[];
  auditLog: BlogAuditLog[];
}

interface DashboardFilters {
  search: string;
  status: string;
  category: string;
  tag: string;
  author: string;
  featured: string;
  sort: string;
}

const createEmptyDraft = (): EditableBlog => ({
  title: '',
  subtitle: '',
  excerpt: '',
  slug: '',
  contentHtml: '<h2 id="intro">Start writing here</h2><p>Shape your article with headings, media, callouts, FAQs, and conversion blocks.</p>',
  contentBlocks: [],
  customHtmlBlocks: [],
  outline: [{ id: 'intro', level: 2, text: 'Start writing here' }],
  author: {
    name: 'Eyeconic Editorial Team',
    email: ADMIN_EMAIL,
    avatar: '',
    role: 'Admin',
  },
  coAuthors: [],
  category: { name: 'General', slug: 'general' },
  tags: [],
  featuredImage: { url: '', altText: '', caption: '', title: '', type: 'image' },
  gallery: [],
  embeds: [],
  status: 'draft',
  visibility: 'public',
  isFeatured: false,
  isPinned: false,
  allowComments: true,
  publishAt: '',
  scheduledFor: '',
  seo: {
    seoTitle: '',
    metaTitle: '',
    metaDescription: '',
    focusKeyword: '',
    keywords: [],
    canonicalUrl: '',
    customSlug: '',
    robotsIndex: true,
    robotsFollow: true,
    openGraph: { title: '', description: '', image: '', type: 'article' },
    twitterCard: { title: '', description: '', image: '', cardType: 'summary_large_image' },
    schemaTypes: ['Article'],
    score: 0,
    suggestions: [],
    warnings: [],
  },
  analytics: {
    views: 0,
    uniqueVisitors: 0,
    averageReadTimeSeconds: 0,
    bounceRate: 0,
    seoPerformance: 0,
    engagementRate: 0,
    topTrafficSources: [],
    dailyViews: [],
  },
  comments: [],
  versions: [],
  auditLog: [],
});

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const extractOutline = (value: string): BlogOutlineItem[] => {
  const matches = [...value.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)];
  return matches.map((match, index) => ({
    id: `${match[1]}-${index + 1}`,
    level: Number(match[1].replace('h', '')),
    text: stripHtml(match[2]),
  }));
};

const toDateTimeInput = (value?: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : '');
const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString() : 'Not set');
const wordCountFromHtml = (value: string) => (stripHtml(value) ? stripHtml(value).split(/\s+/).length : 0);
const readingTimeFromHtml = (value: string) => Math.max(1, Math.ceil(wordCountFromHtml(value) / 220));

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const mapBlogDocumentToDraft = (blog: BlogDocument): EditableBlog => ({
  _id: blog._id,
  title: blog.title,
  subtitle: blog.subtitle || '',
  excerpt: blog.excerpt || '',
  slug: blog.slug,
  contentHtml: blog.contentHtml || '',
  contentBlocks: blog.contentBlocks || [],
  customHtmlBlocks: blog.customHtmlBlocks || [],
  outline: blog.outline || [],
  author: blog.author,
  coAuthors: blog.coAuthors || [],
  category: blog.category || { name: 'General', slug: 'general' },
  tags: blog.tags || [],
  featuredImage: blog.featuredImage || { url: '', altText: '', caption: '', title: '', type: 'image' },
  gallery: blog.gallery || [],
  embeds: blog.embeds || [],
  status: blog.status,
  visibility: blog.visibility,
  isFeatured: blog.isFeatured,
  isPinned: blog.isPinned,
  allowComments: blog.allowComments,
  publishAt: toDateTimeInput(blog.publishAt),
  scheduledFor: toDateTimeInput(blog.scheduledFor),
  seo: {
    ...createEmptyDraft().seo,
    ...blog.seo,
    openGraph: { ...createEmptyDraft().seo.openGraph, ...blog.seo?.openGraph },
    twitterCard: { ...createEmptyDraft().seo.twitterCard, ...blog.seo?.twitterCard },
  },
  analytics: { ...createEmptyDraft().analytics, ...blog.analytics },
  comments: blog.comments || [],
  versions: blog.versions || [],
  auditLog: blog.auditLog || [],
});

const getAuthParams = () => ({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

const CmsBadge: React.FC<{ label: string; tone?: 'default' | 'success' | 'warning' | 'danger' }> = ({ label, tone = 'default' }) => {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/20'
      : tone === 'warning'
        ? 'bg-amber-950/60 text-amber-300 border border-amber-500/20'
        : tone === 'danger'
          ? 'bg-rose-950/60 text-rose-300 border border-rose-500/20'
          : 'bg-[#1E2A38] text-[#94A3B8] border border-white/[0.06]';

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>{label}</span>;
};

const BlogCmsPanel: React.FC = () => {
  const [dashboard, setDashboard] = useState<BlogDashboardResponse | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({
    search: '',
    status: '',
    category: '',
    tag: '',
    author: '',
    featured: '',
    sort: 'updatedAt',
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<EditableBlog>(createEmptyDraft());
  const [activeBlogId, setActiveBlogId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeWorkspace, setActiveWorkspace] = useState<(typeof workspaceTabs)[number]>('editor');
  const [splitPreview, setSplitPreview] = useState(true);
  const [fullscreenEditor, setFullscreenEditor] = useState(false);
  const [bulkAction, setBulkAction] = useState('published');
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [assistantResult, setAssistantResult] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newTag, setNewTag] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const autosaveTimer = useRef<number | null>(null);

  const refreshDashboard = async (nextFilters: DashboardFilters = filters) => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.get<BlogDashboardResponse>(`${API_BASE_URL}/blogs/admin`, {
        params: {
          ...getAuthParams(),
          ...nextFilters,
        },
      });
      setDashboard(response.data);
    } catch (_error) {
      setError('Failed to load blog dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    try {
      const response = await axios.get<{ comments: BlogComment[] }>(`${API_BASE_URL}/blogs/admin/comments`, {
        params: getAuthParams(),
      });
      setComments(response.data.comments);
    } catch (_error) {
      setComments([]);
    }
  };

  const loadBlog = async (blogId: string) => {
    setSaving(true);
    setSuccess('');
    setError('');

    try {
      const response = await axios.get<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${blogId}`, {
        params: getAuthParams(),
      });
      setDraft(mapBlogDocumentToDraft(response.data.blog));
      setActiveBlogId(response.data.blog._id);
      setActiveWorkspace('editor');
    } catch (_error) {
      setError('Failed to open blog');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    refreshDashboard();
    loadComments();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshDashboard(filters);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [filters.search, filters.status, filters.category, filters.tag, filters.author, filters.featured, filters.sort]);

  useEffect(() => {
    const outline = extractOutline(draft.contentHtml);
    setDraft((current) => {
      if (JSON.stringify(current.outline) === JSON.stringify(outline)) {
        return current;
      }

      return { ...current, outline };
    });
  }, [draft.contentHtml]);

  useEffect(() => {
    if (!draft.title.trim() && !draft.contentHtml.trim()) return;
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }

    autosaveTimer.current = window.setTimeout(async () => {
      setAutosaving(true);
      await saveDraft(draft.status, true);
      setAutosaving(false);
    }, 2200);

    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
      }
    };
  }, [draft.title, draft.subtitle, draft.excerpt, draft.contentHtml, draft.status, draft.visibility, draft.isFeatured, draft.isPinned, draft.allowComments, draft.scheduledFor, draft.publishAt, draft.seo.focusKeyword, draft.seo.metaDescription, draft.seo.metaTitle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveDraft(draft.status);
      }

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void changeStatus(draft._id || '', 'published');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft]);

  const updateDraft = <K extends keyof EditableBlog>(key: K, value: EditableBlog[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSuccess('');
  };

  const updateSeo = <K extends keyof BlogSeo>(key: K, value: BlogSeo[K]) => {
    setDraft((current) => ({ ...current, seo: { ...current.seo, [key]: value } }));
    setSuccess('');
  };

  const saveDraft = async (nextStatus?: BlogSummary['status'], silent = false) => {
    if (!draft.title.trim()) {
      if (!silent) setError('Add a title before saving');
      return;
    }

    setSaving(true);
    if (!silent) setError('');

    const payload = {
      ...getAuthParams(),
      ...draft,
      slug: draft.slug || slugify(draft.title),
      publishAt: draft.publishAt ? new Date(draft.publishAt).toISOString() : undefined,
      scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : undefined,
      tags: draft.tags,
      status: nextStatus || draft.status,
      seo: {
        ...draft.seo,
        customSlug: draft.slug || slugify(draft.title),
        metaTitle: draft.seo.metaTitle || draft.title,
        metaDescription: draft.seo.metaDescription || draft.excerpt || stripHtml(draft.contentHtml).slice(0, 180),
        openGraph: {
          ...draft.seo.openGraph,
          image: draft.seo.openGraph?.image || draft.featuredImage.url,
        },
        twitterCard: {
          ...draft.seo.twitterCard,
          image: draft.seo.twitterCard?.image || draft.featuredImage.url,
        },
      },
    };

    try {
      const response = draft._id
        ? await axios.put<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${draft._id}`, payload)
        : await axios.post<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin`, payload);

      const nextDraft = mapBlogDocumentToDraft(response.data.blog);
      setDraft(nextDraft);
      setActiveBlogId(response.data.blog._id);
      await refreshDashboard(filters);
      if (!silent) setSuccess(nextStatus === 'published' ? 'Blog published' : 'Blog saved');
    } catch (_error) {
      if (!silent) setError('Failed to save blog');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (blogId: string, status: BlogSummary['status']) => {
    const id = blogId || draft._id;
    if (!id) {
      await saveDraft(status);
      return;
    }

    setSaving(true);
    try {
      const response = await axios.patch<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${id}/status`, {
        ...getAuthParams(),
        status,
        publishAt: draft.publishAt ? new Date(draft.publishAt).toISOString() : undefined,
        scheduledFor: draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : undefined,
      });
      setDraft(mapBlogDocumentToDraft(response.data.blog));
      await refreshDashboard(filters);
      setSuccess(`Status updated to ${status}`);
    } catch (_error) {
      setError('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = async (blog: BlogSummary) => {
    try {
      await axios.patch(`${API_BASE_URL}/blogs/admin/${blog._id}/feature`, {
        ...getAuthParams(),
        isFeatured: !blog.isFeatured,
        isPinned: blog.isPinned,
      });
      await refreshDashboard(filters);
    } catch (_error) {
      setError('Failed to update feature flags');
    }
  };

  const duplicateBlog = async (blogId: string) => {
    try {
      const response = await axios.post<{ blog: BlogDocument }>(`${API_BASE_URL}/blogs/admin/${blogId}/duplicate`, getAuthParams());
      await refreshDashboard(filters);
      setDraft(mapBlogDocumentToDraft(response.data.blog));
      setActiveBlogId(response.data.blog._id);
      setSuccess('Draft duplicated');
    } catch (_error) {
      setError('Failed to duplicate blog');
    }
  };

  const deleteBlog = async (blogId: string) => {
    if (!window.confirm('Delete this post permanently?')) return;

    try {
      await axios.delete(`${API_BASE_URL}/blogs/admin/${blogId}`, {
        data: getAuthParams(),
      });
      if (draft._id === blogId) {
        setDraft(createEmptyDraft());
        setActiveBlogId('');
      }
      setSelectedIds((current) => current.filter((id) => id !== blogId));
      await refreshDashboard(filters);
      setSuccess('Blog deleted');
    } catch (_error) {
      setError('Failed to delete blog');
    }
  };

  const applyBulkAction = async () => {
    if (!selectedIds.length) {
      setError('Select one or more blogs first');
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/blogs/admin/bulk`, {
        ...getAuthParams(),
        ids: selectedIds,
        action: bulkAction,
      });
      setSelectedIds([]);
      await refreshDashboard(filters);
      setSuccess('Bulk action applied');
    } catch (_error) {
      setError('Failed to apply bulk action');
    }
  };

  const moderateComment = async (commentId: string, action: string) => {
    try {
      await axios.patch(`${API_BASE_URL}/blogs/admin/comments/${commentId}`, {
        ...getAuthParams(),
        action,
      });
      await loadComments();
      if (draft._id) await loadBlog(draft._id);
    } catch (_error) {
      setError('Failed to update comment');
    }
  };

  const runAssistant = async (action: string) => {
    try {
      const response = await axios.post<{ result: string | string[] | Array<{ question: string; answer: string }> }>(
        `${API_BASE_URL}/blogs/admin/assistant`,
        {
          ...getAuthParams(),
          action,
          title: draft.title,
          focusKeyword: draft.seo.focusKeyword,
          content: draft.contentHtml,
          excerpt: draft.excerpt,
        }
      );
      const result = response.data.result;

      if (action === 'generate-outline' && Array.isArray(result)) {
        const snippet = result.map((item) => `<h2>${item}</h2><p>Expand this section with examples, proof, and next steps.</p>`).join('');
        updateDraft('contentHtml', `${draft.contentHtml}${snippet}`);
        setAssistantResult(result.join('\n'));
        return;
      }

      if (action === 'generate-meta-description' && typeof result === 'string') {
        updateSeo('metaDescription', result);
        setAssistantResult(result);
        return;
      }

      if (action === 'generate-seo-title' && typeof result === 'string') {
        updateSeo('metaTitle', result);
        setAssistantResult(result);
        return;
      }

      if (action === 'suggest-keywords' && Array.isArray(result)) {
        updateSeo('keywords', result.map((item) => `${item}`));
        setAssistantResult(result.join(', '));
        return;
      }

      if (action === 'generate-excerpt' && typeof result === 'string') {
        updateDraft('excerpt', result);
        setAssistantResult(result);
        return;
      }

      if (action === 'generate-faq' && Array.isArray(result)) {
        const faqSnippet = result
          .map((item) => `<details><summary>${item.question}</summary><p>${item.answer}</p></details>`)
          .join('');
        updateDraft('contentHtml', `${draft.contentHtml}<section data-type="faq"><h2>Frequently Asked Questions</h2>${faqSnippet}</section>`);
        setAssistantResult(JSON.stringify(result, null, 2));
        return;
      }

      setAssistantResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
      if (typeof result === 'string') {
        updateDraft('contentHtml', `${draft.contentHtml}<p>${result}</p>`);
      }
    } catch (_error) {
      setError('Assistant action failed');
    }
  };

  const insertSnippet = (snippet: string, wrapSelection = false, closingSnippet = '') => {
    const element = contentRef.current;
    if (!element) {
      updateDraft('contentHtml', `${draft.contentHtml}${snippet}${closingSnippet}`);
      return;
    }

    const selectionStart = element.selectionStart;
    const selectionEnd = element.selectionEnd;
    const selected = draft.contentHtml.slice(selectionStart, selectionEnd);
    const inserted = wrapSelection ? `${snippet}${selected}${closingSnippet}` : snippet;
    const nextValue = `${draft.contentHtml.slice(0, selectionStart)}${inserted}${draft.contentHtml.slice(selectionEnd)}`;
    updateDraft('contentHtml', nextValue);

    window.requestAnimationFrame(() => {
      element.focus();
      const caret = selectionStart + inserted.length;
      element.setSelectionRange(caret, caret);
    });
  };

  const uploadMedia = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setMediaBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(`${reader.result || ''}`);
        reader.onerror = () => reject(new Error('Unable to read file'));
        reader.readAsDataURL(file);
      });

      await axios.post(`${API_BASE_URL}/blogs/admin/media`, {
        ...getAuthParams(),
        dataUrl,
        fileName: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        altText: draft.title || file.name,
        sizeKb: Math.round(file.size / 1024),
        type: file.type.startsWith('video') ? 'video' : 'image',
      });

      await refreshDashboard(filters);
      setSuccess('Media uploaded');
    } catch (_error) {
      setError('Media upload failed');
    } finally {
      setMediaBusy(false);
    }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await axios.post(`${API_BASE_URL}/blogs/admin/categories`, {
        ...getAuthParams(),
        name: newCategory,
      });
      setNewCategory('');
      await refreshDashboard(filters);
    } catch (_error) {
      setError('Failed to create category');
    }
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    try {
      await axios.post(`${API_BASE_URL}/blogs/admin/tags`, {
        ...getAuthParams(),
        name: newTag,
      });
      setNewTag('');
      await refreshDashboard(filters);
    } catch (_error) {
      setError('Failed to create tag');
    }
  };

  const localWordCount = wordCountFromHtml(draft.contentHtml);
  const localReadingTime = readingTimeFromHtml(draft.contentHtml);
  const authorChoices = Array.from(new Set((dashboard?.blogs || []).map((blog) => blog.author.email)));
  const topBlogs = [...(dashboard?.blogs || [])].sort((left, right) => right.views - left.views).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Posts', value: dashboard?.summary.totalPosts || 0, icon: FilePlus2 },
          { label: 'Published', value: dashboard?.summary.published || 0, icon: Globe },
          { label: 'Scheduled', value: dashboard?.summary.scheduled || 0, icon: CalendarClock },
          { label: 'Avg SEO', value: dashboard?.summary.averageSeoScore || 0, icon: ShieldCheck },
          { label: 'Views', value: dashboard?.summary.totalViews || 0, icon: BarChart3 },
        ].map((item) => (
          <div key={item.label} className="rounded-[1.75rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-card-dark">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-[0.28em] text-[#94A3B8]">{item.label}</span>
              <item.icon className="h-5 w-5 text-[#18B6A4]" />
            </div>
            <p className="mt-4 text-3xl font-bold text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-card-dark">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap gap-3">
            <label className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[#94A3B8]" />
              <input
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Search titles, content, or slugs"
                className="w-full rounded-2xl border border-[#263445] bg-[#151E29] px-11 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]"
              />
            </label>
            <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">All categories</option>
              {(dashboard?.categories || []).map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
            </select>
            <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none" value={filters.tag} onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))}>
              <option value="">All tags</option>
              {(dashboard?.tags || []).map((tag) => <option key={tag.slug} value={tag.slug}>{tag.name}</option>)}
            </select>
            <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none" value={filters.author} onChange={(event) => setFilters((current) => ({ ...current, author: event.target.value }))}>
              <option value="">All authors</option>
              {authorChoices.map((author) => <option key={author} value={author}>{author}</option>)}
            </select>
            <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none" value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
              <option value="updatedAt">Recently updated</option>
              <option value="publishAt">Publish date</option>
              <option value="analytics.views">Most viewed</option>
              <option value="seo.score">SEO score</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { setDraft(createEmptyDraft()); setActiveBlogId(''); }} className="btn btn-primary text-sm px-4 py-3 rounded-2xl">
              <FilePlus2 className="h-4 w-4 mr-2" /> New post
            </button>
            <button onClick={() => refreshDashboard(filters)} className="btn btn-outline text-sm px-4 py-3 rounded-2xl">
              <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
            </button>
          </div>
        </div>

        {error ? <div className="mt-4 dark-banner-error text-sm">{error}</div> : null}
        {success ? <div className="mt-4 dark-banner-success text-sm">{success}</div> : null}
      </div>

      <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] shadow-card-dark">
        <div className="flex flex-col gap-4 border-b border-white/[0.06] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">Content inventory</h3>
            <p className="text-sm text-[#94A3B8]">Search, filter, feature, schedule, archive, and bulk manage posts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-2.5 text-sm focus:border-[#18B6A4] focus:outline-none" value={bulkAction} onChange={(event) => setBulkAction(event.target.value)}>
              {bulkActions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button onClick={applyBulkAction} className="btn btn-outline py-2.5 px-4 text-sm font-semibold rounded-2xl">
              Apply to selected
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left">
            <thead className="bg-[#0A0F14] text-xs uppercase tracking-[0.2em] text-[#94A3B8] border-b border-white/[0.06]">
              <tr>
                <th className="px-4 py-4"><input type="checkbox" checked={dashboard?.blogs.length ? selectedIds.length === dashboard.blogs.length : false} onChange={(event) => setSelectedIds(event.target.checked ? (dashboard?.blogs || []).map((blog) => blog._id) : [])} /></th>
                <th className="px-4 py-4">Post</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">SEO</th>
                <th className="px-4 py-4">Views</th>
                <th className="px-4 py-4">Updated</th>
                <th className="px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[#94A3B8]">Loading content hub...</td></tr>
              ) : (dashboard?.blogs || []).length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[#94A3B8]">No blogs match the current filters.</td></tr>
              ) : (
                (dashboard?.blogs || []).map((blog) => (
                  <tr key={blog._id} className={`border-t border-white/[0.04] transition hover:bg-[#1E2A38] ${activeBlogId === blog._id ? 'bg-teal-950/20' : ''}`}>
                    <td className="px-4 py-4 align-top"><input type="checkbox" checked={selectedIds.includes(blog._id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, blog._id] : current.filter((item) => item !== blog._id))} /></td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex gap-4">
                        <div className="h-16 w-24 overflow-hidden rounded-2xl bg-[#0F172A] border border-white/[0.04] flex-shrink-0">
                          {blog.featuredImage?.url ? <img src={blog.featuredImage.url} alt={blog.featuredImage.altText || blog.title} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[#64748B]">No media</div>}
                        </div>
                        <div className="space-y-2">
                          <button onClick={() => loadBlog(blog._id)} className="text-left text-base font-semibold text-white transition hover:text-[#18B6A4]">{blog.title}</button>
                          <div className="flex flex-wrap gap-2 text-xs text-[#64748B]">
                            <span>{blog.slug}</span>
                            <span>{blog.category?.name || 'General'}</span>
                            <span>{blog.readingTimeMinutes} min read</span>
                            <span>{blog.commentsCount} comments</span>
                          </div>
                          <p className="max-w-[34rem] text-sm leading-6 text-[#94A3B8]">{blog.excerpt}</p>
                          <div className="flex flex-wrap gap-2">
                            {(blog.tags || []).slice(0, 4).map((tag) => <CmsBadge key={tag.slug} label={tag.name} />)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-2">
                        <CmsBadge label={blog.status} tone={blog.status === 'published' ? 'success' : blog.status === 'scheduled' ? 'warning' : blog.status === 'archived' ? 'danger' : 'default'} />
                        {blog.isFeatured ? <CmsBadge label="Featured" tone="warning" /> : null}
                        {blog.isPinned ? <CmsBadge label="Pinned" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="space-y-2">
                        <p className="text-lg font-bold text-[#4DD7C8]">{blog.seoScore}</p>
                        <p className="max-w-[14rem] text-xs text-[#64748B]">{blog.seoWarnings[0] || blog.seoSuggestions[0] || 'Healthy optimization footprint'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-[#CBD5E1]">
                      <p>{blog.views.toLocaleString()}</p>
                      <p className="text-xs text-[#64748B]">{blog.uniqueVisitors.toLocaleString()} unique</p>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-[#CBD5E1]">
                      <p>{formatDateTime(blog.updatedAt)}</p>
                      <p className="text-xs text-[#64748B]">Publish: {formatDateTime(blog.publishAt)}</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => loadBlog(blog._id)} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] p-2 text-[#CBD5E1] transition hover:border-[#18B6A4] hover:text-[#18B6A4]"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => duplicateBlog(blog._id)} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] p-2 text-[#CBD5E1] transition hover:border-[#18B6A4] hover:text-[#18B6A4]"><Copy className="h-4 w-4" /></button>
                        <button onClick={() => toggleFeature(blog)} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] p-2 text-[#CBD5E1] transition hover:border-[#18B6A4] hover:text-[#18B6A4]"><Star className={`h-4 w-4 ${blog.isFeatured ? 'fill-current text-amber-500' : ''}`} /></button>
                        <button onClick={() => changeStatus(blog._id, blog.status === 'published' ? 'draft' : 'published')} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] p-2 text-[#CBD5E1] transition hover:border-[#18B6A4] hover:text-[#18B6A4]"><Globe className="h-4 w-4" /></button>
                        <button onClick={() => changeStatus(blog._id, 'archived')} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] p-2 text-[#CBD5E1] transition hover:border-[#18B6A4] hover:text-[#18B6A4]"><Archive className="h-4 w-4" /></button>
                        <button onClick={() => deleteBlog(blog._id)} className="rounded-xl border border-red-950/60 bg-red-950/20 p-2 text-red-400 transition hover:bg-red-900/40 hover:text-red-300 hover:border-red-500/30"><Trash2 className="h-4 w-4" /></button>
                        <Link to={`/blog/${blog.slug}`} target="_blank" className="rounded-xl border border-white/[0.08] bg-[#1E2A38] p-2 text-[#CBD5E1] transition hover:border-[#18B6A4] hover:text-[#18B6A4]"><Link2 className="h-4 w-4" /></Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`grid gap-6 ${fullscreenEditor ? 'fixed inset-4 z-[60] overflow-auto rounded-[2rem] bg-[#0A0F14] border border-white/[0.08] p-6' : 'xl:grid-cols-[1.55fr_0.95fr]'}`}>
        <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] shadow-card-dark">
          <div className="flex flex-col gap-4 border-b border-white/[0.06] p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Editor workspace</p>
              <h3 className="text-2xl font-bold text-white">{draft._id ? 'Edit post' : 'Create post'}</h3>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setSplitPreview((current) => !current)} className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#1E2A38] px-4 py-2.5 text-sm font-semibold text-[#CBD5E1] hover:bg-[#263445] hover:text-white transition-colors duration-200"><Eye className="h-4 w-4" /> {splitPreview ? 'Hide preview' : 'Split preview'}</button>
              <button onClick={() => setFullscreenEditor((current) => !current)} className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#1E2A38] px-4 py-2.5 text-sm font-semibold text-[#CBD5E1] hover:bg-[#263445] hover:text-white transition-colors duration-200">{fullscreenEditor ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} {fullscreenEditor ? 'Exit fullscreen' : 'Fullscreen'}</button>
              <button onClick={() => saveDraft(draft.status)} className="btn btn-outline text-sm px-4 py-2.5 rounded-2xl"><Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : autosaving ? 'Autosaving...' : 'Save'}</button>
              <button onClick={() => changeStatus(draft._id || '', 'published')} className="btn btn-primary text-sm px-4 py-2.5 rounded-2xl"><Globe className="h-4 w-4 mr-2" /> Publish</button>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <input value={draft.title} onChange={(event) => { updateDraft('title', event.target.value); if (!draft.slug) updateDraft('slug', slugify(event.target.value)); }} placeholder="SEO-first headline" className="rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-base font-semibold focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />
              <input value={draft.subtitle} onChange={(event) => updateDraft('subtitle', event.target.value)} placeholder="Subtitle / dek" className="rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />
              <input value={draft.slug} onChange={(event) => updateDraft('slug', slugify(event.target.value))} placeholder="custom-slug" className="rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />
              <input value={draft.author.name} onChange={(event) => updateDraft('author', { ...draft.author, name: event.target.value })} placeholder="Primary author" className="rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />
              <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" value={draft.status} onChange={(event) => updateDraft('status', event.target.value as BlogSummary['status'])}>
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" value={draft.visibility} onChange={(event) => updateDraft('visibility', event.target.value as BlogSummary['visibility'])}>
                {visibilityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" value={draft.category.slug} onChange={(event) => {
                const selected = (dashboard?.categories || []).find((item) => item.slug === event.target.value);
                updateDraft('category', selected || { name: 'General', slug: 'general' });
              }}>
                {(dashboard?.categories || [{ name: 'General', slug: 'general' }]).map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
              </select>
              <input value={draft.coAuthors.join(', ')} onChange={(event) => updateDraft('coAuthors', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Co-authors, comma separated" className="rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />
              <input type="datetime-local" value={draft.publishAt} onChange={(event) => updateDraft('publishAt', event.target.value)} className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />
              <input type="datetime-local" value={draft.scheduledFor} onChange={(event) => updateDraft('scheduledFor', event.target.value)} className="rounded-2xl border border-[#263445] bg-[#151E29] text-white px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />
            </div>

            <textarea value={draft.excerpt} onChange={(event) => updateDraft('excerpt', event.target.value)} placeholder="Excerpt for cards, search, and metadata" className="min-h-28 w-full rounded-[1.5rem] border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm leading-6 focus:border-[#18B6A4] focus:outline-none transition-all duration-200" />

            <div className="rounded-[1.75rem] border border-white/[0.06] bg-[#151E29] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {[
                  { icon: Bold, label: 'Bold', action: () => insertSnippet('<strong>', true, '</strong>') },
                  { icon: Italic, label: 'Italic', action: () => insertSnippet('<em>', true, '</em>') },
                  { icon: Underline, label: 'Underline', action: () => insertSnippet('<u>', true, '</u>') },
                  { icon: Heading, label: 'Heading', action: () => insertSnippet('<h2>Section title</h2>') },
                  { icon: Quote, label: 'Quote', action: () => insertSnippet('<blockquote>Quote or testimonial goes here.</blockquote>') },
                  { icon: Code2, label: 'Code', action: () => insertSnippet('<pre><code>// code block</code></pre>') },
                  { icon: List, label: 'Bullet list', action: () => insertSnippet('<ul><li>Point one</li><li>Point two</li></ul>') },
                  { icon: ListOrdered, label: 'Numbered', action: () => insertSnippet('<ol><li>Step one</li><li>Step two</li></ol>') },
                  { icon: CheckSquare, label: 'Checklist', action: () => insertSnippet('<ul><li><input type="checkbox" checked /> Complete keyword research</li><li><input type="checkbox" /> Add internal links</li></ul>') },
                  { icon: ImagePlus, label: 'Image', action: () => insertSnippet(`<figure><img src="${draft.featuredImage.url || 'https://placehold.co/1200x675'}" alt="${draft.featuredImage.altText || draft.title}" /><figcaption>Caption</figcaption></figure>`) },
                  { icon: Link2, label: 'Link', action: () => insertSnippet('<a href="/blogs" target="_blank" rel="noopener noreferrer">Internal or external link</a>') },
                  { icon: Table2, label: 'Table', action: () => insertSnippet('<table><thead><tr><th>Feature</th><th>Benefit</th></tr></thead><tbody><tr><td>Speed</td><td>Faster execution</td></tr></tbody></table>') },
                  { icon: AlignLeft, label: 'Left', action: () => insertSnippet('<div style="text-align:left;">Aligned content</div>') },
                  { icon: AlignCenter, label: 'Center', action: () => insertSnippet('<div style="text-align:center;">Aligned content</div>') },
                  { icon: AlignRight, label: 'Right', action: () => insertSnippet('<div style="text-align:right;">Aligned content</div>') },
                  { icon: Highlighter, label: 'Highlight', action: () => insertSnippet('<mark>', true, '</mark>') },
                  { icon: Minus, label: 'Divider', action: () => insertSnippet('<hr />') },
                ].map((tool) => (
                  <button key={tool.label} type="button" onClick={tool.action} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#1E2A38] px-3 py-2 text-xs font-semibold text-[#CBD5E1] hover:border-[#18B6A4] hover:text-[#18B6A4] transition-all">
                    <tool.icon className="h-4 w-4" /> {tool.label}
                  </button>
                ))}
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  { label: '/cta', snippet: '<section data-type="cta" class="cta-box"><h2>Ready to take the next step?</h2><p>Drive the reader to action with one sharp line.</p><a href="https://forms.gle/CAa6xLNsjsdhJt5M7">Book a Call</a></section>' },
                  { label: '/faq', snippet: '<section data-type="faq"><h2>Frequently Asked Questions</h2><details><summary>Question</summary><p>Answer.</p></details></section>' },
                  { label: '/testimonial', snippet: '<section data-type="testimonial"><blockquote>"A strong testimonial quote."</blockquote><p><strong>Student Name</strong>, Rank Holder</p></section>' },
                  { label: '/warning', snippet: '<aside data-type="warning"><strong>Warning:</strong> Flag common mistakes or edge cases here.</aside>' },
                  { label: '/comparison', snippet: '<table><thead><tr><th>Option</th><th>Best for</th><th>Trade-off</th></tr></thead><tbody><tr><td>Approach A</td><td>Beginners</td><td>Slower start</td></tr><tr><td>Approach B</td><td>Advanced users</td><td>Higher complexity</td></tr></tbody></table>' },
                  { label: '/youtube', snippet: '<figure><iframe src="https://www.youtube.com/embed/VIDEO_ID" title="YouTube video" allowfullscreen></iframe><figcaption>Embedded lesson</figcaption></figure>' },
                ].map((item) => (
                  <button key={item.label} onClick={() => insertSnippet(item.snippet)} className="rounded-full bg-[#263445] text-white hover:bg-[#2D3F54] border border-white/[0.04] px-3 py-1.5 text-xs font-semibold transition-colors">{item.label}</button>
                ))}
              </div>

              <div className={`grid gap-4 ${splitPreview ? 'xl:grid-cols-2' : ''}`}>
                <textarea
                  ref={contentRef}
                  value={draft.contentHtml}
                  onChange={(event) => updateDraft('contentHtml', event.target.value)}
                  placeholder="Write HTML-rich content, insert blocks, or use slash commands above."
                  className="min-h-[34rem] w-full rounded-[1.75rem] border border-[#263445] bg-[#151E29] px-4 py-4 font-mono text-sm leading-7 text-white focus:border-[#18B6A4] focus:outline-none"
                />
                {splitPreview ? (
                  <div className="rounded-[1.75rem] border border-white/[0.06] bg-[#0A0F14] p-5 overflow-auto max-h-[34rem]">
                    <BlogArticleContent title={draft.title || 'Untitled post'} subtitle={draft.subtitle} contentHtml={draft.contentHtml} featuredImage={draft.featuredImage} outline={draft.outline} />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              <label className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#151E29] p-4 text-sm font-semibold text-[#CBD5E1]"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => updateDraft('isFeatured', event.target.checked)} /> Featured blog</label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#151E29] p-4 text-sm font-semibold text-[#CBD5E1]"><input type="checkbox" checked={draft.isPinned} onChange={(event) => updateDraft('isPinned', event.target.checked)} /> Pinned blog</label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#151E29] p-4 text-sm font-semibold text-[#CBD5E1]"><input type="checkbox" checked={draft.allowComments} onChange={(event) => updateDraft('allowComments', event.target.checked)} /> Comments enabled</label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#151E29] p-4 text-sm font-semibold text-[#CBD5E1]"><input type="checkbox" checked={draft.seo.robotsIndex !== false} onChange={(event) => updateSeo('robotsIndex', event.target.checked)} /> Indexable</label>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveWorkspace(tab)}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                    activeWorkspace === tab 
                      ? 'btn btn-primary' 
                      : 'bg-[#1E2A38] text-[#94A3B8] border border-white/[0.04] hover:bg-[#263445] hover:text-[#CBD5E1]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {activeWorkspace === 'seo' ? (
            <div className="space-y-6 rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">SEO command center</h3>
                  <p className="text-sm text-[#94A3B8]">Metadata, schema, robots, keyword targeting, and quality signals.</p>
                </div>
                <div className="rounded-full bg-gradient-to-r from-amber-950/40 via-[#151E29] to-emerald-950/40 border border-white/[0.06] px-5 py-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">SEO score</p>
                  <p className="text-3xl font-bold text-white">{draft.seo.score || 0}</p>
                </div>
              </div>

              <input value={draft.seo.focusKeyword || ''} onChange={(event) => updateSeo('focusKeyword', event.target.value)} placeholder="Focus keyword" className="w-full rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" />
              <input value={(draft.seo.keywords || []).join(', ')} onChange={(event) => updateSeo('keywords', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Secondary keywords" className="w-full rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" />
              <input value={draft.seo.metaTitle || ''} onChange={(event) => updateSeo('metaTitle', event.target.value)} placeholder="Meta title" className="w-full rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" />
              <textarea value={draft.seo.metaDescription || ''} onChange={(event) => updateSeo('metaDescription', event.target.value)} placeholder="Meta description" className="min-h-28 w-full rounded-[1.5rem] border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" />
              <input value={draft.seo.canonicalUrl || ''} onChange={(event) => updateSeo('canonicalUrl', event.target.value)} placeholder="Canonical URL" className="w-full rounded-2xl border border-[#263445] bg-[#151E29] text-white placeholder-[#94A3B8] px-4 py-3 text-sm focus:border-[#18B6A4] focus:outline-none focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" />

              <div className="grid gap-3 sm:grid-cols-2">
                {schemaOptions.map((item) => (
                  <label key={item} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#151E29] p-4 text-sm text-[#CBD5E1]">
                    <input
                      type="checkbox"
                      checked={(draft.seo.schemaTypes || []).includes(item)}
                      onChange={(event) => {
                        const values = new Set(draft.seo.schemaTypes || []);
                        if (event.target.checked) values.add(item); else values.delete(item);
                        updateSeo('schemaTypes', Array.from(values));
                      }}
                    />
                    {item}
                  </label>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Info className="h-4 w-4 text-[#18B6A4]" /> Suggestions</p>
                  <div className="space-y-2 text-sm text-[#94A3B8]">
                    {(draft.seo.suggestions || []).length ? (draft.seo.suggestions || []).map((item) => <p key={item}>• {item}</p>) : <p>No active suggestions yet. Save once to recalculate on the server.</p>}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-amber-500/20 bg-amber-950/20 p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-400"><ShieldCheck className="h-4 w-4" /> Warnings</p>
                  <div className="space-y-2 text-sm text-amber-300">
                    {(draft.seo.warnings || []).length ? (draft.seo.warnings || []).map((item) => <p key={item}>• {item}</p>) : <p>No duplicate or metadata warnings detected.</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/[0.06] bg-[#0A0F14] p-4 text-white">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => runAssistant('generate-seo-title')} className="rounded-full bg-[#1E2A38] border border-white/[0.06] text-[#CBD5E1] hover:bg-[#263445] hover:text-white px-3 py-2 text-xs font-semibold transition-colors">AI SEO title</button>
                  <button onClick={() => runAssistant('generate-meta-description')} className="rounded-full bg-[#1E2A38] border border-white/[0.06] text-[#CBD5E1] hover:bg-[#263445] hover:text-white px-3 py-2 text-xs font-semibold transition-colors">AI meta description</button>
                  <button onClick={() => runAssistant('suggest-keywords')} className="rounded-full bg-[#1E2A38] border border-white/[0.06] text-[#CBD5E1] hover:bg-[#263445] hover:text-white px-3 py-2 text-xs font-semibold transition-colors">AI keywords</button>
                  <button onClick={() => runAssistant('generate-excerpt')} className="rounded-full bg-[#1E2A38] border border-white/[0.06] text-[#CBD5E1] hover:bg-[#263445] hover:text-white px-3 py-2 text-xs font-semibold transition-colors">AI excerpt</button>
                </div>
                {assistantResult ? <pre className="mt-4 whitespace-pre-wrap text-xs leading-6 text-[#CBD5E1]">{assistantResult}</pre> : null}
              </div>
            </div>
          ) : null}

          {activeWorkspace === 'media' ? (
            <div className="space-y-6 rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-sm">
              <div>
                <h3 className="text-xl font-bold text-white">Media library</h3>
                <p className="text-sm text-[#94A3B8]">Upload, select, caption, and reuse featured images or gallery assets.</p>
              </div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/20 bg-[#151E29] px-6 py-10 text-center text-sm text-[#CBD5E1] hover:border-[#18B6A4] transition-all">
                <UploadCloud className="mb-3 h-8 w-8 text-[#18B6A4]" />
                <span className="font-semibold">Drop an image or click to upload</span>
                <span className="mt-2 text-xs text-[#94A3B8]">Stores the file in the CMS media library and makes it reusable in content.</span>
                <input type="file" accept="image/*" className="hidden" onChange={(event) => void uploadMedia(event.target.files)} />
              </label>
              {mediaBusy ? <p className="text-sm text-[#94A3B8]">Uploading media...</p> : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(dashboard?.media || []).map((asset) => (
                  <div key={asset._id || asset.url} className="overflow-hidden rounded-[1.5rem] border border-white/[0.06] bg-[#151E29]">
                    <div className="aspect-video bg-[#0F172A]">{asset.url ? <img src={asset.url} alt={asset.altText || asset.title || 'Media'} className="h-full w-full object-cover" /> : null}</div>
                    <div className="space-y-3 p-4">
                      <div>
                        <p className="font-semibold text-white">{asset.title || 'Untitled asset'}</p>
                        <p className="text-xs text-[#94A3B8]">{asset.altText || 'No alt text yet'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => updateDraft('featuredImage', asset)} className="btn btn-primary text-xs px-3 py-2 rounded-xl">Set featured</button>
                        <button onClick={() => updateDraft('gallery', [...draft.gallery, asset])} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] text-[#CBD5E1] px-3 py-2 text-xs font-semibold hover:bg-[#263445] transition-colors">Add gallery</button>
                        <button onClick={() => insertSnippet(`<figure><img src="${asset.url}" alt="${asset.altText || draft.title}" /><figcaption>${asset.caption || ''}</figcaption></figure>`)} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] text-[#CBD5E1] px-3 py-2 text-xs font-semibold hover:bg-[#263445] transition-colors">Insert</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeWorkspace === 'taxonomy' ? (
            <div className="space-y-6 rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-sm">
              <div>
                <h3 className="text-xl font-bold text-white">Taxonomy management</h3>
                <p className="text-sm text-[#94A3B8]">Manage categories, nested labels, tags, and SEO metadata anchors.</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Tags className="h-4 w-4 text-[#18B6A4]" /> Categories</div>
                  <div className="mb-4 flex gap-2">
                    <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" className="flex-1 rounded-xl border border-[#263445] bg-[#0A0F14] text-white placeholder-[#94A3B8] px-3 py-2 text-sm focus:border-[#18B6A4] focus:outline-none" />
                    <button onClick={addCategory} className="btn btn-primary px-3 py-2 rounded-xl text-xs font-bold">Add</button>
                  </div>
                  <div className="space-y-2">
                    {(dashboard?.categories || []).map((category) => (
                      <button key={category.slug} onClick={() => updateDraft('category', category)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm ${draft.category.slug === category.slug ? 'bg-[#1E2A38] text-[#18B6A4] border border-[rgba(24,182,164,0.3)]' : 'bg-[#0A0F14] text-[#CBD5E1] border border-white/[0.04]'}`}>
                        <span>{category.name}</span>
                        <span className="text-xs text-[#64748B]">{category.postCount || 0} posts</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Flame className="h-4 w-4 text-[#18B6A4]" /> Tags</div>
                  <div className="mb-4 flex gap-2">
                    <input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="New tag" className="flex-1 rounded-xl border border-[#263445] bg-[#0A0F14] text-white placeholder-[#94A3B8] px-3 py-2 text-sm focus:border-[#18B6A4] focus:outline-none" />
                    <button onClick={addTag} className="btn btn-primary px-3 py-2 rounded-xl text-xs font-bold">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(dashboard?.tags || []).map((tag) => {
                      const selected = draft.tags.some((item) => item.slug === tag.slug);
                      return (
                        <button
                          key={tag.slug}
                          onClick={() => updateDraft('tags', selected ? draft.tags.filter((item) => item.slug !== tag.slug) : [...draft.tags, tag])}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selected ? 'bg-[#18B6A4] text-white font-semibold' : 'bg-[#0A0F14] text-[#CBD5E1] border border-white/[0.04] hover:bg-[#1E2A38] transition-colors'}`}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeWorkspace === 'comments' ? (
            <div className="space-y-4 rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-sm">
              <div>
                <h3 className="text-xl font-bold text-white">Comments moderation</h3>
                <p className="text-sm text-[#94A3B8]">Approve, reject, mark spam, or block abusive responses.</p>
              </div>
              {(comments || []).length === 0 ? <p className="text-sm text-[#94A3B8]">No comments in moderation queue.</p> : comments.map((comment) => (
                <div key={comment._id} className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{comment.authorName} on {comment.blogTitle}</p>
                      <p className="text-xs text-[#94A3B8]">{comment.authorEmail} · {formatDateTime(comment.createdAt)}</p>
                    </div>
                    <CmsBadge label={comment.status} tone={comment.status === 'approved' ? 'success' : comment.status === 'spam' || comment.status === 'blocked' ? 'danger' : 'warning'} />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#CBD5E1]">{comment.content}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => moderateComment(comment._id, 'approved')} className="rounded-xl bg-emerald-700 text-white hover:bg-emerald-600 px-3 py-2 text-xs font-semibold transition-colors">Approve</button>
                    <button onClick={() => moderateComment(comment._id, 'rejected')} className="rounded-xl bg-amber-600 text-white hover:bg-amber-500 px-3 py-2 text-xs font-semibold transition-colors">Reject</button>
                    <button onClick={() => moderateComment(comment._id, 'spam')} className="rounded-xl bg-rose-700 text-white hover:bg-rose-600 px-3 py-2 text-xs font-semibold transition-colors">Spam</button>
                    <button onClick={() => moderateComment(comment._id, 'blocked')} className="rounded-xl border border-white/[0.08] bg-[#1E2A38] text-[#CBD5E1] hover:bg-[#263445] px-3 py-2 text-xs font-semibold transition-colors">Block user</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeWorkspace === 'analytics' ? (
            <div className="space-y-6 rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-sm">
              <div>
                <h3 className="text-xl font-bold text-white">Analytics</h3>
                <p className="text-sm text-[#94A3B8]">Monitor views, unique readers, engagement, and SEO performance.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Views', value: draft.analytics.views || 0 },
                  { label: 'Unique visitors', value: draft.analytics.uniqueVisitors || 0 },
                  { label: 'Avg read time', value: `${Math.round((draft.analytics.averageReadTimeSeconds || 0) / 60)} min` },
                  { label: 'Engagement', value: `${draft.analytics.engagementRate || 0}%` },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">{metric.label}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                <p className="mb-3 text-sm font-semibold text-white">Top posts by views</p>
                <div className="space-y-3">
                  {topBlogs.map((blog) => (
                    <div key={blog._id} className="flex items-center justify-between rounded-xl bg-[#0A0F14] text-[#CBD5E1] border border-white/[0.04] px-4 py-3 text-sm">
                      <span>{blog.title}</span>
                      <span className="text-xs text-[#94A3B8]">{blog.views.toLocaleString()} views</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeWorkspace === 'editor' ? (
            <div className="space-y-6 rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Word count</p>
                  <p className="mt-2 text-2xl font-bold text-white">{localWordCount}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Reading time</p>
                  <p className="mt-2 text-2xl font-bold text-white">{localReadingTime} min</p>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                <p className="mb-3 text-sm font-semibold text-white">Outline navigation</p>
                <div className="space-y-2">
                  {(draft.outline || []).length ? draft.outline.map((item) => <a key={item.id} href={`#${item.id}`} className="block rounded-xl px-3 py-2 text-sm text-[#CBD5E1] transition hover:bg-[#1E2A38] hover:text-[#18B6A4]" style={{ paddingLeft: `${item.level * 8}px` }}>{item.text}</a>) : <p className="text-sm text-[#94A3B8]">Add headings to generate an outline.</p>}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#0A0F14] p-4 text-white">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-teal-300" /> AI assistant</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => runAssistant('generate-outline')} className="rounded-full bg-[#1E2A38] border border-white/[0.06] text-[#CBD5E1] hover:bg-[#263445] hover:text-white px-3 py-2 text-xs font-semibold transition-colors">Outline</button>
                  <button onClick={() => runAssistant('improve-writing')} className="rounded-full bg-[#1E2A38] border border-white/[0.06] text-[#CBD5E1] hover:bg-[#263445] hover:text-white px-3 py-2 text-xs font-semibold transition-colors">Improve writing</button>
                  <button onClick={() => runAssistant('generate-faq')} className="rounded-full bg-[#1E2A38] border border-white/[0.06] text-[#CBD5E1] hover:bg-[#263445] hover:text-white px-3 py-2 text-xs font-semibold transition-colors">FAQ block</button>
                </div>
                {assistantResult ? <pre className="mt-4 whitespace-pre-wrap text-xs leading-6 text-[#CBD5E1]">{assistantResult}</pre> : null}
              </div>
              <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                <p className="mb-3 text-sm font-semibold text-white">Version history</p>
                <div className="space-y-3 text-sm text-[#94A3B8]">
                  {(draft.versions || []).slice(0, 5).map((version) => <div key={version._id || version.savedAt} className="rounded-xl bg-[#0A0F14] border border-white/[0.04] px-4 py-3"><strong className="text-white">{version.summary || version.status}</strong><div className="text-xs mt-1">{formatDateTime(version.savedAt)} by {version.savedBy}</div></div>)}
                  {(draft.versions || []).length === 0 ? <p>No saved versions yet.</p> : null}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/[0.06] bg-[#151E29] p-4">
                <p className="mb-3 text-sm font-semibold text-white">Audit trail</p>
                <div className="space-y-3 text-sm text-[#94A3B8]">
                  {(draft.auditLog || []).slice(0, 6).map((entry) => <div key={entry._id || entry.at} className="rounded-xl bg-[#0A0F14] border border-white/[0.04] px-4 py-3"><strong className="text-white">{entry.action}</strong><div className="text-xs mt-1">{entry.details}</div><div className="text-xs mt-0.5">{formatDateTime(entry.at)} by {entry.actor}</div></div>)}
                  {(draft.auditLog || []).length === 0 ? <p>No audit events yet.</p> : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BlogCmsPanel;