const express = require('express');
const sanitizeHtml = require('sanitize-html');
const Blog = require('../models/Blog');
const Category = require('../models/Category');
const Tag = require('../models/Tag');
const MediaAsset = require('../models/MediaAsset');
const { renderAndSanitize, assertRenderable, emptyDoc, stripText } = require('../content/renderer');
const { sanitizeLinkUrl } = require('../content/linkUtils');
const { handleUpload } = require('../middleware/upload');
const {
  createMediaFromRequest,
  deleteMediaAsset,
  findMediaAssetUsage,
  getUploadConfig,
} = require('../services/mediaService');

const router = express.Router();

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';
const MAX_REVISIONS = 50;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_AUTHOR = {
  name: 'Eyeconic Editorial Team',
  email: ADMIN_EMAIL,
  avatar: '',
  role: 'Admin',
};

const allowedSchemaTypes = ['Article', 'BlogPosting', 'FAQ', 'Breadcrumb', 'HowTo', 'Review'];

const isValidAdminCredentials = (email, password) => email === ADMIN_EMAIL && password === ADMIN_PASSWORD;

const ensureAdmin = (req, res) => {
  const email = req.body.email || req.query.email;
  const password = req.body.password || req.query.password;

  if (!isValidAdminCredentials(email, password)) {
    res.status(401).json({ msg: 'Unauthorized' });
    return false;
  }

  return true;
};

const slugify = (value = '') =>
  value
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

const stripHtml = (value = '') =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeEditorHtml = (value = '') =>
  sanitizeHtml(value || '', {
    allowedTags: [
      'p', 'div', 'span', 'strong', 'em', 'u', 's', 'blockquote', 'code', 'pre', 'hr', 'br',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'figure', 'figcaption',
      'iframe', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'aside', 'mark', 'sup', 'sub', 'label', 'input',
    ],
    allowedAttributes: {
      '*': ['class', 'style', 'id', 'data-type', 'data-variant', 'data-layout', 'data-align', 'data-checked', 'data-font'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      iframe: ['src', 'allow', 'allowfullscreen', 'frameborder', 'title', 'loading'],
      input: ['type', 'disabled', 'checked'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      iframe: (tagName, attribs) => {
        const src = attribs.src || '';
        if (!src.includes('youtube.com') && !src.includes('youtu.be')) {
          return { tagName: 'div', text: 'Unsupported embed removed' };
        }
        return { tagName, attribs };
      },
      a: (tagName, attribs) => {
        const result = sanitizeLinkUrl(attribs.href || '');
        if (!result.ok) return { tagName: 'span', text: '' };
        return {
          tagName,
          attribs: {
            ...attribs,
            href: result.href,
            ...(result.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {}),
          },
        };
      },
    },
  });

const buildUniqueSlug = async (desired, excludeId = null) => {
  let base = slugify(desired || 'post') || `post-${Date.now()}`;
  if (!SLUG_PATTERN.test(base)) {
    base = slugify(base.replace(/[^a-z0-9-]/g, '')) || `post-${Date.now()}`;
  }

  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Blog.exists(query);
    if (!exists) return candidate;
    candidate = `${base}-${n}`;
    n += 1;
  }
};

const resolveContent = (payload = {}, existingBlog = null) => {
  const hasBlocks =
    payload.contentBlocks &&
    typeof payload.contentBlocks === 'object' &&
    !Array.isArray(payload.contentBlocks) &&
    payload.contentBlocks.type === 'doc';

  if (hasBlocks) {
    assertRenderable(payload.contentBlocks);
    const contentHtml = renderAndSanitize(payload.contentBlocks);
    return {
      contentBlocks: payload.contentBlocks,
      contentHtml,
      contentText: stripHtml(contentHtml) || stripText(payload.contentBlocks),
    };
  }

  // Legacy array contentBlocks or HTML-only payloads
  if (Array.isArray(payload.contentBlocks) && payload.contentBlocks.length) {
    const legacyHtml = sanitizeEditorHtml(payload.contentHtml || '');
    return {
      contentBlocks: existingBlog?.contentBlocks || emptyDoc(),
      contentHtml: legacyHtml,
      contentText: stripHtml(legacyHtml),
    };
  }

  if (payload.contentHtml || payload.description) {
    const contentHtml = sanitizeEditorHtml(payload.contentHtml || payload.description || '');
    return {
      contentBlocks: existingBlog?.contentBlocks || null,
      contentHtml,
      contentText: stripHtml(contentHtml),
    };
  }

  if (existingBlog) {
    return {
      contentBlocks: existingBlog.contentBlocks || null,
      contentHtml: existingBlog.contentHtml || '',
      contentText: existingBlog.contentText || stripHtml(existingBlog.contentHtml || ''),
    };
  }

  return {
    contentBlocks: emptyDoc(),
    contentHtml: '',
    contentText: '',
  };
};

const pruneVersions = (versions = []) => {
  if (!Array.isArray(versions)) return [];
  return versions.slice(0, MAX_REVISIONS);
};

const enforceSingleFeatured = async (blogId) => {
  await Blog.updateMany({ _id: { $ne: blogId }, isFeatured: true }, { $set: { isFeatured: false } });
};

const isPubliclyVisible = (blog, now = new Date()) => {
  if (!blog || blog.visibility === 'private') return false;
  if (blog.expiresAt && new Date(blog.expiresAt) <= now) return false;

  if (blog.status === 'published') return true;
  if (blog.status === 'scheduled' && blog.scheduledFor && new Date(blog.scheduledFor) <= now) return true;
  return false;
};

const publicVisibilityFilter = (now = new Date()) => ({
  visibility: { $ne: 'private' },
  $and: [
    {
      $or: [
        { expiresAt: null },
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: now } },
      ],
    },
    {
      $or: [
        { status: 'published' },
        { status: 'scheduled', scheduledFor: { $lte: now } },
      ],
    },
  ],
});

const getWordCount = (value = '') => {
  const text = stripHtml(value);
  return text ? text.split(/\s+/).length : 0;
};

const estimateReadingTimeMinutes = (wordCount) => Math.max(1, Math.ceil(wordCount / 220));

const buildOutline = (html = '') => {
  const matches = [...html.matchAll(/<(h[1-6])[^>]*\sid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi)];
  if (matches.length) {
    return matches.map((match) => ({
      id: match[2],
      level: Number(match[1].replace('h', '')),
      text: stripHtml(match[3]),
    }));
  }

  const fallback = [...html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)];
  return fallback.map((match, index) => ({
    id: `${match[1]}-${index + 1}`,
    level: Number(match[1].replace('h', '')),
    text: stripHtml(match[2]),
  }));
};

const getKeywordDensity = (text = '', keyword = '') => {
  if (!text || !keyword) return 0;

  const normalizedText = text.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase().trim();
  if (!normalizedKeyword) return 0;

  const matches = normalizedText.match(new RegExp(normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || [];
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length || 1;
  return Number(((matches.length / wordCount) * 100).toFixed(2));
};

const computeReadability = (text = '') => {
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const paragraphs = text.split(/\n+/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  const avgSentenceLength = sentences.length ? words.length / sentences.length : words.length;
  const avgParagraphLength = paragraphs.length ? words.length / paragraphs.length : words.length;

  let score = 100;
  const suggestions = [];

  if (avgSentenceLength > 24) {
    score -= 12;
    suggestions.push('Shorten average sentence length for better readability.');
  }

  if (avgParagraphLength > 90) {
    score -= 10;
    suggestions.push('Break long paragraphs into smaller scannable sections.');
  }

  if (words.length < 300) {
    score -= 8;
    suggestions.push('Increase content depth to improve topical authority.');
  }

  return {
    score: Math.max(0, score),
    suggestions,
  };
};

const analyzeSeo = (draft, existingBlogs = []) => {
  const warnings = [];
  const suggestions = [];
  let score = 100;

  const title = (draft.title || '').trim();
  const metaTitle = (draft.seo?.metaTitle || draft.seo?.seoTitle || title).trim();
  const metaDescription = (draft.seo?.metaDescription || draft.excerpt || '').trim();
  const focusKeyword = (draft.seo?.focusKeyword || draft.seo?.keywords?.[0] || '').trim();
  const text = stripHtml(draft.contentHtml || '');
  const density = getKeywordDensity(text, focusKeyword);
  const hasInternalLinks = /href=["']\/(?!\/)/i.test(draft.contentHtml || '');
  const hasExternalLinks = /href=["']https?:\/\//i.test(draft.contentHtml || '');
  const headingCount = (draft.outline || []).length;
  const missingAlt = ((draft.contentHtml || '').match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
  const readability = computeReadability(text);

  if (!focusKeyword) {
    score -= 10;
    warnings.push('Add a focus keyword to enable deeper optimization guidance.');
  }

  if (focusKeyword && !title.toLowerCase().includes(focusKeyword.toLowerCase())) {
    score -= 10;
    suggestions.push('Place the focus keyword in the blog title.');
  }

  if (focusKeyword && !metaDescription.toLowerCase().includes(focusKeyword.toLowerCase())) {
    score -= 8;
    suggestions.push('Add the focus keyword to the meta description.');
  }

  if (!metaTitle) {
    score -= 10;
    warnings.push('Meta title is missing.');
  }

  if (!metaDescription) {
    score -= 10;
    warnings.push('Meta description is missing.');
  }

  if (headingCount < 2) {
    score -= 8;
    suggestions.push('Use more structured headings to improve scannability.');
  }

  if (!hasInternalLinks) {
    score -= 6;
    suggestions.push('Add at least one internal link.');
  }

  if (!hasExternalLinks) {
    score -= 4;
    suggestions.push('Add a trusted external reference.');
  }

  if (density > 3 || density < 0.4) {
    score -= 8;
    suggestions.push('Keep keyword density between 0.4% and 3%.');
  }

  if (missingAlt > 0) {
    score -= Math.min(10, missingAlt * 2);
    suggestions.push('Add alt text to all images.');
  }

  if ((draft.slug || '').length < 5 || (draft.slug || '').length > 80) {
    score -= 6;
    suggestions.push('Keep the slug concise and descriptive.');
  }

  score -= Math.max(0, 100 - readability.score) * 0.15;
  suggestions.push(...readability.suggestions);

  const duplicateTitle = existingBlogs.find((item) => item._id?.toString() !== draft._id?.toString() && item.title?.trim().toLowerCase() === title.toLowerCase());
  if (duplicateTitle) {
    score -= 12;
    warnings.push('Another post already uses the same title.');
  }

  const duplicateMeta = existingBlogs.find(
    (item) => item._id?.toString() !== draft._id?.toString() && (item.seo?.metaDescription || '').trim().toLowerCase() === metaDescription.toLowerCase() && metaDescription
  );
  if (duplicateMeta) {
    score -= 8;
    warnings.push('Another post already uses the same meta description.');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    suggestions: [...new Set(suggestions)].filter(Boolean),
    warnings: [...new Set(warnings)].filter(Boolean),
  };
};

const getYoutubeVideoId = (url = '') => {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '').trim();
    }

    if (parsed.hostname.includes('youtube.com')) {
      const byQuery = parsed.searchParams.get('v');
      if (byQuery) return byQuery;

      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = pathParts.findIndex((part) => part === 'embed' || part === 'shorts');
      if (embedIndex !== -1 && pathParts[embedIndex + 1]) {
        return pathParts[embedIndex + 1];
      }
    }
  } catch (_error) {
    return '';
  }

  return '';
};

const getFeaturedImage = (payload = {}) => {
  const directImage = payload.featuredImage || {};
  const youtubeUrl = payload.youtubeUrl || '';
  const videoId = youtubeUrl ? getYoutubeVideoId(youtubeUrl) : '';
  const fallbackThumb = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';

  return {
    url: directImage.url || fallbackThumb || '',
    title: directImage.title || payload.title || '',
    altText: directImage.altText || payload.title || '',
    caption: directImage.caption || '',
    type: directImage.type || 'image',
    width: directImage.width || 0,
    height: directImage.height || 0,
  };
};

const normalizeTaxonomy = (input = {}, fallbackName = '') => {
  const name = (input.name || fallbackName || '').trim();
  const slug = slugify(input.slug || name);
  return {
    id: input.id || slug,
    name,
    slug,
    seoTitle: (input.seoTitle || '').trim(),
    metaDescription: (input.metaDescription || '').trim(),
  };
};

const normalizeBlogPayload = async (payload = {}, existingBlog = null) => {
  const title = (payload.title || '').trim();
  if (!title) {
    const err = new Error('Blog title is required');
    err.status = 400;
    throw err;
  }

  const subtitle = (payload.subtitle || '').trim();
  let resolved;
  try {
    resolved = resolveContent(payload, existingBlog);
  } catch (error) {
    error.status = 400;
    throw error;
  }

  const { contentBlocks, contentHtml, contentText } = resolved;
  const wordCount = getWordCount(contentHtml) || (contentText ? contentText.split(/\s+/).filter(Boolean).length : 0);
  const excerpt = (payload.excerpt || contentText.slice(0, 220)).trim();

  const requestedSlug = (payload.seo?.customSlug || payload.slug || '').trim();
  if (requestedSlug && !SLUG_PATTERN.test(slugify(requestedSlug))) {
    const err = new Error('Slug may only contain lowercase letters, numbers, and hyphens.');
    err.status = 400;
    throw err;
  }

  const slug = await buildUniqueSlug(requestedSlug || title || existingBlog?.slug || 'post', existingBlog?._id);

  const status = payload.status || existingBlog?.status || 'draft';
  if (!['draft', 'review', 'published', 'scheduled', 'archived'].includes(status)) {
    const err = new Error('Invalid status');
    err.status = 400;
    throw err;
  }

  if (status === 'scheduled') {
    const scheduledFor = payload.scheduledFor || existingBlog?.scheduledFor;
    if (!scheduledFor) {
      const err = new Error('Scheduled posts require a publish date/time.');
      err.status = 400;
      throw err;
    }
  }

  const category = normalizeTaxonomy(payload.category || {}, payload.category?.name || existingBlog?.category?.name || 'General');
  const tags = (Array.isArray(payload.tags) ? payload.tags : [])
    .map((tag) => normalizeTaxonomy(typeof tag === 'string' ? { name: tag } : tag))
    .filter((tag) => tag.name);

  const outline = buildOutline(contentHtml);
  const author = payload.author?.name
    ? { ...DEFAULT_AUTHOR, ...(typeof payload.author === 'string' ? { name: payload.author } : payload.author) }
    : typeof payload.author === 'string' && payload.author.trim()
      ? { ...DEFAULT_AUTHOR, name: payload.author.trim() }
      : existingBlog?.author || DEFAULT_AUTHOR;

  const featuredImageInput =
    payload.featuredImage ||
    (payload.thumbnailUrl ? { url: payload.thumbnailUrl } : null) ||
    existingBlog?.featuredImage ||
    {};

  const seoMetaDescription = (payload.seo?.metaDescription || excerpt).trim().slice(0, 160);
  const seo = {
    seoTitle: (payload.seo?.seoTitle || title).trim().slice(0, 70),
    metaTitle: (payload.seo?.metaTitle || payload.seo?.seoTitle || title).trim().slice(0, 70),
    metaDescription: seoMetaDescription,
    focusKeyword: (payload.seo?.focusKeyword || '').trim(),
    keywords: Array.isArray(payload.seo?.keywords)
      ? payload.seo.keywords.map((item) => `${item}`.trim()).filter(Boolean)
      : [],
    canonicalUrl: (payload.seo?.canonicalUrl || '').trim(),
    customSlug: slug,
    robotsIndex: payload.seo?.robotsIndex !== false && payload.seo?.noIndex !== true,
    robotsFollow: payload.seo?.robotsFollow !== false,
    openGraph: {
      title: (payload.seo?.openGraph?.title || payload.seo?.metaTitle || title).trim(),
      description: (payload.seo?.openGraph?.description || seoMetaDescription).trim(),
      image: payload.seo?.openGraph?.image || payload.seo?.ogImageUrl || featuredImageInput?.url || '',
      type: payload.seo?.openGraph?.type || 'article',
    },
    twitterCard: {
      title: (payload.seo?.twitterCard?.title || payload.seo?.metaTitle || title).trim(),
      description: (payload.seo?.twitterCard?.description || seoMetaDescription).trim(),
      image: payload.seo?.twitterCard?.image || payload.seo?.ogImageUrl || featuredImageInput?.url || '',
      cardType: payload.seo?.twitterCard?.cardType || 'summary_large_image',
    },
    schemaTypes: (Array.isArray(payload.seo?.schemaTypes) ? payload.seo.schemaTypes : ['Article']).filter((item) =>
      allowedSchemaTypes.includes(item)
    ),
  };

  return {
    title,
    subtitle,
    excerpt,
    slug,
    contentHtml,
    contentText,
    contentBlocks,
    customHtmlBlocks: Array.isArray(payload.customHtmlBlocks)
      ? payload.customHtmlBlocks.filter(Boolean)
      : existingBlog?.customHtmlBlocks || [],
    outline,
    author,
    coAuthors: Array.isArray(payload.coAuthors)
      ? payload.coAuthors.map((item) => `${item}`.trim()).filter(Boolean)
      : existingBlog?.coAuthors || [],
    category,
    tags,
    featuredImage: getFeaturedImage({
      ...payload,
      featuredImage: featuredImageInput,
      youtubeUrl: payload.youtubeUrl ?? existingBlog?.youtubeUrl,
      title,
    }),
    youtubeUrl: (payload.youtubeUrl ?? existingBlog?.youtubeUrl ?? '').trim(),
    gallery: Array.isArray(payload.gallery) ? payload.gallery : existingBlog?.gallery || [],
    embeds: Array.isArray(payload.embeds) ? payload.embeds : existingBlog?.embeds || [],
    status,
    visibility: payload.visibility || existingBlog?.visibility || 'public',
    isFeatured: Boolean(payload.isFeatured ?? payload.featured),
    isPinned: Boolean(payload.isPinned),
    allowComments: payload.allowComments !== false,
    publishAt:
      status === 'published'
        ? new Date(payload.publishAt || existingBlog?.publishAt || Date.now())
        : existingBlog?.publishAt || null,
    scheduledFor: status === 'scheduled' && payload.scheduledFor ? new Date(payload.scheduledFor) : status === 'scheduled' ? existingBlog?.scheduledFor || null : null,
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : payload.expiresAt === null ? null : existingBlog?.expiresAt || null,
    archivedAt: status === 'archived' ? new Date() : null,
    readingTimeMinutes: estimateReadingTimeMinutes(wordCount),
    wordCount,
    seo,
    analytics: existingBlog?.analytics || undefined,
    draft: { title: '', contentBlocks: null, savedAt: null },
    updatedBy: ADMIN_EMAIL,
  };
};

const refreshTaxonomyCounts = async () => {
  const [categories, tags] = await Promise.all([Category.find({}), Tag.find({})]);

  await Promise.all(
    categories.map(async (category) => {
      const postCount = await Blog.countDocuments({ 'category.slug': category.slug, status: { $in: ['published', 'scheduled', 'draft', 'review'] } });
      category.postCount = postCount;
      return category.save();
    })
  );

  await Promise.all(
    tags.map(async (tag) => {
      const postCount = await Blog.countDocuments({ 'tags.slug': tag.slug, status: { $in: ['published', 'scheduled', 'draft', 'review'] } });
      tag.postCount = postCount;
      return tag.save();
    })
  );
};

const syncScheduledPosts = async () => {
  const now = new Date();
  await Blog.updateMany(
    { status: 'scheduled', scheduledFor: { $lte: now } },
    {
      $set: { status: 'published', publishAt: now },
      $push: { auditLog: { action: 'auto-published', actor: 'system', details: 'Scheduled publication reached', at: now } },
    }
  );
};

const getDashboardSummary = async () => {
  const blogs = await Blog.find({}).lean();
  const totalViews = blogs.reduce((sum, blog) => sum + (blog.analytics?.views || 0), 0);
  const totalUniqueVisitors = blogs.reduce((sum, blog) => sum + (blog.analytics?.uniqueVisitors || 0), 0);
  const averageSeoScore = blogs.length
    ? Math.round(blogs.reduce((sum, blog) => sum + (blog.seo?.score || 0), 0) / blogs.length)
    : 0;

  return {
    totalPosts: blogs.length,
    drafts: blogs.filter((blog) => blog.status === 'draft').length,
    published: blogs.filter((blog) => blog.status === 'published').length,
    scheduled: blogs.filter((blog) => blog.status === 'scheduled').length,
    archived: blogs.filter((blog) => blog.status === 'archived').length,
    featured: blogs.filter((blog) => blog.isFeatured).length,
    pinned: blogs.filter((blog) => blog.isPinned).length,
    totalViews,
    totalUniqueVisitors,
    averageSeoScore,
    averageReadTime: blogs.length
      ? Math.round((blogs.reduce((sum, blog) => sum + (blog.analytics?.averageReadTimeSeconds || 0), 0) / blogs.length) / 60)
      : 0,
  };
};

const buildQuery = ({ search, status, category, tag, author, featured, dateFrom, dateTo }) => {
  const query = {};

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { excerpt: { $regex: search, $options: 'i' } },
      { contentText: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { 'author.name': { $regex: search, $options: 'i' } },
      { 'tags.name': { $regex: search, $options: 'i' } },
    ];
  }

  if (status) query.status = status;
  if (category) query['category.slug'] = category;
  if (tag) query['tags.slug'] = tag;
  if (author) {
    query.$or = [
      ...(query.$or || []),
      { 'author.email': author },
      { 'author.name': { $regex: author, $options: 'i' } },
    ];
  }
  if (featured === 'true' || featured === true) query.isFeatured = true;
  if (featured === 'false' || featured === false) query.isFeatured = false;

  if (dateFrom || dateTo) {
    query.updatedAt = {};
    if (dateFrom) query.updatedAt.$gte = new Date(dateFrom);
    if (dateTo) query.updatedAt.$lte = new Date(dateTo);
  }

  return query;
};

const mapBlogSummary = (blog) => ({
  _id: blog._id,
  title: blog.title,
  subtitle: blog.subtitle,
  excerpt: blog.excerpt,
  slug: blog.slug,
  author: blog.author,
  coAuthors: blog.coAuthors,
  category: blog.category,
  tags: blog.tags,
  status: blog.status,
  visibility: blog.visibility,
  isFeatured: blog.isFeatured,
  isPinned: blog.isPinned,
  allowComments: blog.allowComments,
  featuredImage: blog.featuredImage,
  youtubeUrl: blog.youtubeUrl || '',
  publishAt: blog.publishAt,
  scheduledFor: blog.scheduledFor,
  expiresAt: blog.expiresAt,
  archivedAt: blog.archivedAt,
  updatedAt: blog.updatedAt,
  createdAt: blog.createdAt,
  readingTimeMinutes: blog.readingTimeMinutes,
  wordCount: blog.wordCount,
  views: blog.analytics?.views || 0,
  uniqueVisitors: blog.analytics?.uniqueVisitors || 0,
  seoScore: blog.seo?.score || 0,
  seoWarnings: blog.seo?.warnings || [],
  seoSuggestions: blog.seo?.suggestions || [],
  commentsCount: Array.isArray(blog.comments) ? blog.comments.length : 0,
  hasDraft: Boolean(blog.draft?.savedAt),
});

router.get('/admin/categories', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const categories = await Category.find({}).sort({ name: 1 });
  res.json({ categories });
});

router.post('/admin/categories', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ msg: 'Category name is required' });

  const slug = slugify(req.body.slug || name);
  const category = await Category.create({
    name,
    slug,
    description: (req.body.description || '').trim(),
    parentSlug: (req.body.parentSlug || '').trim(),
    seoTitle: (req.body.seoTitle || name).trim(),
    metaDescription: (req.body.metaDescription || '').trim(),
  });

  res.status(201).json({ category });
});

router.put('/admin/categories/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ msg: 'Category not found' });

  const previousSlug = category.slug;
  category.name = (req.body.name || category.name).trim();
  category.slug = slugify(req.body.slug || category.name);
  category.description = (req.body.description || category.description || '').trim();
  category.parentSlug = (req.body.parentSlug || category.parentSlug || '').trim();
  category.seoTitle = (req.body.seoTitle || category.seoTitle || category.name).trim();
  category.metaDescription = (req.body.metaDescription || category.metaDescription || '').trim();
  await category.save();

  await Blog.updateMany(
    { 'category.slug': previousSlug },
    {
      $set: {
        category: {
          id: category.slug,
          name: category.name,
          slug: category.slug,
          seoTitle: category.seoTitle,
          metaDescription: category.metaDescription,
        },
      },
    }
  );

  await refreshTaxonomyCounts();
  res.json({ category });
});

router.delete('/admin/categories/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ msg: 'Category not found' });

  await Blog.updateMany(
    { 'category.slug': category.slug },
    {
      $set: {
        category: {
          id: 'general',
          name: 'General',
          slug: 'general',
          seoTitle: 'General',
          metaDescription: '',
        },
      },
    }
  );

  await refreshTaxonomyCounts();
  res.json({ msg: 'Category deleted' });
});

router.get('/admin/tags', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const tags = await Tag.find({}).sort({ name: 1 });
  res.json({ tags });
});

router.post('/admin/tags', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ msg: 'Tag name is required' });

  const tag = await Tag.create({
    name,
    slug: slugify(req.body.slug || name),
    description: (req.body.description || '').trim(),
    seoTitle: (req.body.seoTitle || name).trim(),
    metaDescription: (req.body.metaDescription || '').trim(),
  });

  res.status(201).json({ tag });
});

router.put('/admin/tags/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const tag = await Tag.findById(req.params.id);
  if (!tag) return res.status(404).json({ msg: 'Tag not found' });

  const previousSlug = tag.slug;
  tag.name = (req.body.name || tag.name).trim();
  tag.slug = slugify(req.body.slug || tag.name);
  tag.description = (req.body.description || tag.description || '').trim();
  tag.seoTitle = (req.body.seoTitle || tag.seoTitle || tag.name).trim();
  tag.metaDescription = (req.body.metaDescription || tag.metaDescription || '').trim();
  await tag.save();

  const blogs = await Blog.find({ 'tags.slug': previousSlug });
  await Promise.all(
    blogs.map(async (blog) => {
      blog.tags = blog.tags.map((item) => (item.slug === previousSlug ? normalizeTaxonomy({ ...item.toObject?.() || item, name: tag.name, slug: tag.slug, seoTitle: tag.seoTitle, metaDescription: tag.metaDescription }) : item));
      return blog.save();
    })
  );

  await refreshTaxonomyCounts();
  res.json({ tag });
});

router.delete('/admin/tags/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const tag = await Tag.findByIdAndDelete(req.params.id);
  if (!tag) return res.status(404).json({ msg: 'Tag not found' });

  const blogs = await Blog.find({ 'tags.slug': tag.slug });
  await Promise.all(
    blogs.map(async (blog) => {
      blog.tags = blog.tags.filter((item) => item.slug !== tag.slug);
      return blog.save();
    })
  );

  await refreshTaxonomyCounts();
  res.json({ msg: 'Tag deleted' });
});

router.get('/admin/media', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(48, Math.max(1, Number(req.query.limit || 24)));
  const search = (req.query.search || '').trim();
  const kind = (req.query.kind || req.query.type || '').trim();

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { displayName: { $regex: search, $options: 'i' } },
      { fileName: { $regex: search, $options: 'i' } },
      { altText: { $regex: search, $options: 'i' } },
      { caption: { $regex: search, $options: 'i' } },
    ];
  }
  if (kind && kind !== 'all') {
    query.$and = [
      ...(query.$or ? [{ $or: query.$or }] : []),
      { $or: [{ kind }, { type: kind }] },
    ];
    delete query.$or;
  }

  const [media, total] = await Promise.all([
    MediaAsset.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    MediaAsset.countDocuments(query),
  ]);

  res.json({ media, total, page, limit });
});

router.get('/admin/media/upload-config', (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const config = getUploadConfig();
  if (!config.ok) {
    return res.status(config.status || 503).json({ msg: config.message || 'Image storage is not configured on the server.' });
  }

  res.json({
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    folder: config.folder,
    timestamp: config.timestamp,
    signature: config.signature,
    storageProvider: 'cloudinary',
  });
});

router.post('/admin/media', handleUpload, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const result = await createMediaFromRequest({
      body: req.body || {},
      file: req.file,
      uploadedBy: ADMIN_EMAIL,
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ msg: result.message || 'Unable to upload image.' });
    }

    res.status(201).json({ media: result.media });
  } catch (error) {
    console.error('[media] Create asset failed', { message: error.message, name: error.name });
    res.status(500).json({ msg: 'Unable to upload image. Please try again.' });
  }
});

router.post('/admin/media/batch', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ msg: 'No media items provided' });
  if (items.length > 10) return res.status(400).json({ msg: 'Maximum 10 files per batch' });

  try {
    const created = [];
    for (const item of items) {
      const result = await createMediaFromRequest({
        body: item,
        uploadedBy: ADMIN_EMAIL,
      });
      if (result.ok && result.media) created.push(result.media);
    }

    if (!created.length) {
      return res.status(400).json({ msg: 'No valid media items could be uploaded.' });
    }

    res.status(201).json({ media: created });
  } catch (error) {
    console.error('[media] Batch upload failed', { message: error.message });
    res.status(500).json({ msg: 'Unable to upload images. Please try again.' });
  }
});

router.put('/admin/media/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const media = await MediaAsset.findById(req.params.id);
  if (!media) return res.status(404).json({ msg: 'Media asset not found' });

  media.title = (req.body.title || media.title || '').trim();
  media.displayName = (req.body.displayName || media.displayName || media.title || '').trim();
  media.url = (req.body.url || media.url || '').trim();
  media.altText = (req.body.altText || media.altText || '').trim();
  media.caption = (req.body.caption || media.caption || '').trim();
  media.fileName = (req.body.fileName || media.fileName || '').trim();
  media.type = (req.body.type || media.type || 'image').trim();
  media.kind = (req.body.kind || media.kind || media.type || 'image').trim();
  if (Array.isArray(req.body.tags)) {
    media.tags = req.body.tags.map((t) => `${t}`.trim().toLowerCase()).filter(Boolean);
  }
  media.width = Number(req.body.width || media.width || 0);
  media.height = Number(req.body.height || media.height || 0);
  media.sizeKb = Number(req.body.sizeKb || media.sizeKb || 0);
  media.isOptimized = req.body.isOptimized === undefined ? media.isOptimized : Boolean(req.body.isOptimized);
  await media.save();

  res.json({ media });
});

router.get('/admin/media/:id/usage', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const media = await MediaAsset.findById(req.params.id);
    if (!media) return res.status(404).json({ msg: 'Media asset not found' });

    const usage = await findMediaAssetUsage(media);
    res.json({ usage, count: usage.length });
  } catch (error) {
    console.error('[media] Usage lookup failed', { message: error.message });
    res.status(500).json({ msg: 'Unable to check media usage.' });
  }
});

router.delete('/admin/media/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const media = await MediaAsset.findById(req.params.id);
    if (!media) return res.status(404).json({ msg: 'Media asset not found' });

    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await deleteMediaAsset(media, { force });
    if (!result.ok) {
      return res.status(result.status || 400).json({
        msg: result.message || 'Unable to delete media asset.',
        usage: result.usage || [],
        canForceDelete: Boolean(result.canForceDelete),
      });
    }

    res.json({
      msg: 'Media asset deleted',
      usageCount: Array.isArray(result.usage) ? result.usage.length : 0,
    });
  } catch (error) {
    console.error('[media] Delete failed', { message: error.message });
    res.status(500).json({ msg: 'Unable to delete media asset.' });
  }
});

router.get('/admin/comments', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blogs = await Blog.find({ 'comments.0': { $exists: true } }).select('title slug comments');
  const comments = blogs.flatMap((blog) =>
    blog.comments.map((comment) => ({
      blogId: blog._id,
      blogTitle: blog.title,
      blogSlug: blog.slug,
      ...comment.toObject(),
    }))
  );

  res.json({ comments: comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

router.patch('/admin/comments/:commentId', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { commentId } = req.params;
  const { action, replyContent } = req.body;
  const blog = await Blog.findOne({ 'comments._id': commentId });
  if (!blog) return res.status(404).json({ msg: 'Comment not found' });

  const comment = blog.comments.id(commentId);
  if (!comment) return res.status(404).json({ msg: 'Comment not found' });

  if (['approved', 'rejected', 'spam', 'blocked', 'pending'].includes(action)) {
    comment.status = action;
  }

  if (action === 'reply' && replyContent) {
    comment.replies.push({ authorName: 'Eyeconic Team', content: `${replyContent}`.trim() });
    comment.status = 'approved';
  }

  comment.updatedAt = new Date();
  blog.auditLog.push({ action: 'comment-moderated', actor: ADMIN_EMAIL, details: `${action} comment`, at: new Date() });
  await blog.save();

  res.json({ comment });
});

router.post('/admin/assistant', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const action = (req.body.action || '').trim();
  const title = (req.body.title || '').trim();
  const focusKeyword = (req.body.focusKeyword || '').trim();
  const content = stripHtml(req.body.content || '');
  const excerpt = (req.body.excerpt || '').trim();

  const responses = {
    outline: [
      `Introduction: why ${focusKeyword || title || 'this topic'} matters now`,
      `Core concept breakdown with exam-focused takeaways`,
      `Common mistakes students make`,
      `Action plan and checklist`,
      `FAQ section with 4 sharp answers`,
    ],
    seoTitle: `${title || focusKeyword || 'Eyeconic Blog'} | Strategy, Examples, and Expert Guide`,
    metaDescription: excerpt || `Learn ${focusKeyword || title || 'this topic'} with a practical Eyeconic guide covering strategy, examples, common mistakes, and action steps.`,
    keywords: [focusKeyword, `${focusKeyword} tips`, `${focusKeyword} guide`, `${focusKeyword} strategy`].filter(Boolean),
    excerpt: excerpt || `${title || 'This guide'} delivers a practical breakdown, readable examples, and a clear next-step framework for students preparing with Eyeconic.`,
    faq: [
      { question: `What is the fastest way to improve ${focusKeyword || 'performance'}?`, answer: 'Start with the highest-frequency weak area, build a repeatable review cycle, and track progress weekly.' },
      { question: `How often should I revise ${focusKeyword || 'the topic'}?`, answer: 'Use short revision intervals after every focused practice block and a deeper weekly review.' },
      { question: 'How do I know if the article is SEO-ready?', answer: 'Check keyword placement, metadata, heading structure, image alt text, internal links, and readability signals.' },
    ],
    improvedParagraph: content
      ? `${content.split('. ').slice(0, 3).join('. ')}. This version improves clarity, keeps the pace tighter, and makes the main takeaway easier to scan.`
      : 'Paste a paragraph to receive a stronger rewrite.',
  };

  res.json({
    result:
      action === 'generate-outline'
        ? responses.outline
        : action === 'generate-seo-title'
          ? responses.seoTitle
          : action === 'generate-meta-description'
            ? responses.metaDescription
            : action === 'suggest-keywords'
              ? responses.keywords
              : action === 'generate-excerpt'
                ? responses.excerpt
                : action === 'generate-faq'
                  ? responses.faq
                  : responses.improvedParagraph,
  });
});

router.get('/admin', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  await syncScheduledPosts();

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const search = (req.query.search || '').trim();
  const sort = req.query.sort || 'updatedAt';
  const sortDirection = req.query.order === 'asc' ? 1 : -1;
  const query = buildQuery(req.query);

  const [blogs, total, categories, tags, media, summary] = await Promise.all([
    Blog.find(query)
      .sort({ [sort]: sortDirection })
      .skip((page - 1) * limit)
      .limit(limit),
    Blog.countDocuments(query),
    Category.find({}).sort({ name: 1 }),
    Tag.find({}).sort({ name: 1 }),
    MediaAsset.find({}).sort({ createdAt: -1 }).limit(40),
    getDashboardSummary(),
  ]);

  res.json({
    blogs: blogs.map(mapBlogSummary),
    total,
    page,
    limit,
    search,
    summary,
    categories,
    tags,
    media,
  });
});

router.get('/admin/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  res.json({ blog });
});

router.post('/admin', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const payload = await normalizeBlogPayload(req.body);
    const existingBlogs = await Blog.find({}).select('title seo.metaDescription');
    payload.seo = { ...payload.seo, ...analyzeSeo(payload, existingBlogs) };
    payload.analytics = { seoPerformance: payload.seo.score };
    payload.versions = [
      {
        title: payload.title,
        excerpt: payload.excerpt,
        contentHtml: payload.contentHtml,
        contentBlocks: payload.contentBlocks,
        status: payload.status,
        summary: 'Initial version',
        savedBy: ADMIN_EMAIL,
      },
    ];
    payload.auditLog = [
      {
        action: 'created',
        actor: ADMIN_EMAIL,
        details: `Created ${payload.status} post`,
        at: new Date(),
      },
    ];
    payload.createdBy = ADMIN_EMAIL;

    const blog = await Blog.create(payload);

    if (blog.isFeatured) {
      await enforceSingleFeatured(blog._id);
    }

    if (blog.category?.name) {
      await Category.findOneAndUpdate(
        { slug: blog.category.slug },
        {
          name: blog.category.name,
          slug: blog.category.slug,
          description: '',
          seoTitle: blog.category.seoTitle || blog.category.name,
          metaDescription: blog.category.metaDescription || '',
        },
        { upsert: true, new: true }
      );
    }

    await Promise.all(
      (blog.tags || []).map((tag) =>
        Tag.findOneAndUpdate(
          { slug: tag.slug },
          {
            name: tag.name,
            slug: tag.slug,
            seoTitle: tag.seoTitle || tag.name,
            metaDescription: tag.metaDescription || '',
          },
          { upsert: true, new: true }
        )
      )
    );

    await refreshTaxonomyCounts();
    res.status(201).json({ blog });
  } catch (error) {
    res.status(error.status || 500).json({ msg: error.message || 'Unable to create blog' });
  }
});

router.put('/admin/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ msg: 'Blog not found' });

    const payload = await normalizeBlogPayload(req.body, blog);
    const existingBlogs = await Blog.find({}).select('title seo.metaDescription');
    const seo = analyzeSeo({ ...payload, _id: blog._id }, existingBlogs);

    blog.versions.unshift({
      title: blog.title,
      excerpt: blog.excerpt,
      contentHtml: blog.contentHtml,
      contentBlocks: blog.contentBlocks,
      status: blog.status,
      savedBy: ADMIN_EMAIL,
      summary: 'Pre-update snapshot',
    });
    blog.versions = pruneVersions(blog.versions);

    Object.assign(blog, payload, {
      seo: { ...payload.seo, ...seo },
      analytics: {
        ...(blog.analytics?.toObject ? blog.analytics.toObject() : blog.analytics),
        seoPerformance: seo.score,
      },
      draft: { title: '', contentBlocks: null, savedAt: null },
    });

    blog.auditLog.push({ action: 'updated', actor: ADMIN_EMAIL, details: `Updated ${blog.status} post`, at: new Date() });
    await blog.save();

    if (blog.isFeatured) {
      await enforceSingleFeatured(blog._id);
    }

    await refreshTaxonomyCounts();
    res.json({ blog });
  } catch (error) {
    res.status(error.status || 500).json({ msg: error.message || 'Unable to update blog' });
  }
});

router.put('/admin/:id/draft', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ msg: 'Blog not found' });

    const title = (req.body.title || blog.title || '').trim();
    const contentBlocks = req.body.contentBlocks;
    if (contentBlocks) assertRenderable(contentBlocks);

    blog.draft = {
      title,
      contentBlocks: contentBlocks || blog.draft?.contentBlocks || null,
      savedAt: new Date(),
    };
    await blog.save();

    res.json({
      draft: blog.draft,
      msg: 'Draft autosaved',
    });
  } catch (error) {
    res.status(error.status || 400).json({ msg: error.message || 'Unable to autosave draft' });
  }
});

router.delete('/admin/:id/draft', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  blog.draft = { title: '', contentBlocks: null, savedAt: null };
  await blog.save();
  res.json({ msg: 'Draft discarded' });
});

router.get('/admin/:id/revisions', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blog = await Blog.findById(req.params.id).select('versions title');
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  const revisions = (blog.versions || []).slice(0, 20).map((version, index) => ({
    id: version._id,
    index,
    title: version.title,
    excerpt: version.excerpt,
    status: version.status,
    summary: version.summary,
    savedAt: version.savedAt,
    savedBy: version.savedBy,
  }));

  res.json({ revisions });
});

router.post('/admin/:id/revisions/:revisionId/restore', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ msg: 'Blog not found' });

    const revision = blog.versions.id(req.params.revisionId);
    if (!revision) return res.status(404).json({ msg: 'Revision not found' });

    blog.versions.unshift({
      title: blog.title,
      excerpt: blog.excerpt,
      contentHtml: blog.contentHtml,
      contentBlocks: blog.contentBlocks,
      status: blog.status,
      savedBy: ADMIN_EMAIL,
      summary: 'Snapshot before restoring…',
    });
    blog.versions = pruneVersions(blog.versions);

    blog.title = revision.title || blog.title;
    blog.excerpt = revision.excerpt || blog.excerpt;
    if (revision.contentBlocks) {
      assertRenderable(revision.contentBlocks);
      blog.contentBlocks = revision.contentBlocks;
      blog.contentHtml = renderAndSanitize(revision.contentBlocks);
      blog.contentText = stripHtml(blog.contentHtml);
    } else {
      blog.contentHtml = sanitizeEditorHtml(revision.contentHtml || blog.contentHtml);
      blog.contentText = stripHtml(blog.contentHtml);
    }
    blog.outline = buildOutline(blog.contentHtml);
    blog.wordCount = getWordCount(blog.contentHtml);
    blog.readingTimeMinutes = estimateReadingTimeMinutes(blog.wordCount);
    blog.draft = { title: '', contentBlocks: null, savedAt: null };
    blog.auditLog.push({
      action: 'revision-restored',
      actor: ADMIN_EMAIL,
      details: `Restored revision ${req.params.revisionId}`,
      at: new Date(),
    });

    await blog.save();
    res.json({ blog, msg: 'Revision restored successfully.' });
  } catch (error) {
    res.status(error.status || 500).json({ msg: error.message || 'Unable to restore revision' });
  }
});

router.post('/admin/:id/duplicate', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const original = await Blog.findById(req.params.id).lean();
  if (!original) return res.status(404).json({ msg: 'Blog not found' });

  const duplicate = { ...original };
  delete duplicate._id;
  delete duplicate.createdAt;
  delete duplicate.updatedAt;
  duplicate.title = `${original.title} Copy`;
  duplicate.slug = await buildUniqueSlug(`${original.slug}-copy`);
  duplicate.status = 'draft';
  duplicate.isFeatured = false;
  duplicate.publishAt = null;
  duplicate.scheduledFor = null;
  duplicate.expiresAt = null;
  duplicate.draft = { title: '', contentBlocks: null, savedAt: null };
  duplicate.auditLog = [{ action: 'duplicated', actor: ADMIN_EMAIL, details: `Duplicated from ${original._id}`, at: new Date() }];
  duplicate.versions = [
    {
      title: duplicate.title,
      excerpt: duplicate.excerpt,
      contentHtml: duplicate.contentHtml,
      contentBlocks: duplicate.contentBlocks,
      status: 'draft',
      summary: 'Duplicate created',
      savedBy: ADMIN_EMAIL,
    },
  ];

  const created = await Blog.create(duplicate);
  res.status(201).json({ blog: created });
});

router.patch('/admin/:id/status', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  // Support both status enum and published boolean (list toggles)
  let nextStatus = req.body.status;
  if (req.body.published === true) nextStatus = 'published';
  if (req.body.published === false) nextStatus = 'draft';

  if (!['draft', 'review', 'published', 'scheduled', 'archived'].includes(nextStatus)) {
    return res.status(400).json({ msg: 'Invalid status' });
  }

  if (nextStatus === 'scheduled' && !req.body.scheduledFor && !blog.scheduledFor) {
    return res.status(400).json({ msg: 'Scheduled posts require a publish date/time.' });
  }

  blog.status = nextStatus;
  blog.publishAt = nextStatus === 'published' ? new Date(req.body.publishAt || Date.now()) : blog.publishAt;
  blog.scheduledFor = nextStatus === 'scheduled' ? new Date(req.body.scheduledFor || blog.scheduledFor) : null;
  blog.archivedAt = nextStatus === 'archived' ? new Date() : null;
  blog.auditLog.push({ action: 'status-changed', actor: ADMIN_EMAIL, details: `Changed status to ${nextStatus}`, at: new Date() });
  await blog.save();

  res.json({ blog: mapBlogSummary(blog) });
});

router.patch('/admin/:id/feature', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  if (req.body.isFeatured !== undefined) blog.isFeatured = Boolean(req.body.isFeatured);
  if (req.body.isPinned !== undefined) blog.isPinned = Boolean(req.body.isPinned);
  blog.auditLog.push({ action: 'featured-updated', actor: ADMIN_EMAIL, details: 'Updated feature flags', at: new Date() });
  await blog.save();

  if (blog.isFeatured) {
    await enforceSingleFeatured(blog._id);
  }

  res.json({ blog: mapBlogSummary(blog) });
});

router.post('/admin/bulk', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const action = req.body.action;
  if (!ids.length) return res.status(400).json({ msg: 'No blogs selected' });

  if (action === 'delete') {
    await Blog.deleteMany({ _id: { $in: ids } });
    return res.json({ msg: 'Blogs deleted' });
  }

  if (['draft', 'review', 'published', 'scheduled', 'archived'].includes(action)) {
    await Blog.updateMany(
      { _id: { $in: ids } },
      {
        $set: { status: action },
        $push: { auditLog: { action: 'bulk-status', actor: ADMIN_EMAIL, details: `Bulk status update to ${action}`, at: new Date() } },
      }
    );
    return res.json({ msg: 'Blogs updated' });
  }

  if (action === 'feature') {
    await Blog.updateMany({ _id: { $in: ids } }, { $set: { isFeatured: true } });
    return res.json({ msg: 'Blogs featured' });
  }

  if (action === 'unfeature') {
    await Blog.updateMany({ _id: { $in: ids } }, { $set: { isFeatured: false } });
    return res.json({ msg: 'Blogs unfeatured' });
  }

  res.status(400).json({ msg: 'Unsupported bulk action' });
});

router.delete('/admin/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const deleted = await Blog.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ msg: 'Blog not found' });

  await refreshTaxonomyCounts();
  res.json({ msg: 'Blog deleted' });
});

router.get('/filters', async (_req, res) => {
  await syncScheduledPosts();

  const [categories, tags, authors] = await Promise.all([
    Category.find({}).sort({ name: 1 }),
    Tag.find({}).sort({ name: 1 }),
    Blog.distinct('author.email', { status: 'published' }),
  ]);

  res.json({ categories, tags, authors });
});

router.get('/sitemap.xml', async (_req, res) => {
  await syncScheduledPosts();
  const now = new Date();
  const blogs = await Blog.find(publicVisibilityFilter(now)).sort({ updatedAt: -1 });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${blogs
    .map(
      (blog) =>
        `<url><loc>/blog/${blog.slug}</loc><lastmod>${new Date(blog.updatedAt).toISOString()}</lastmod><changefreq>weekly</changefreq><priority>${blog.isFeatured ? '0.9' : '0.7'}</priority></url>`
    )
    .join('')}</urlset>`;
  res.header('Content-Type', 'application/xml').send(xml);
});

router.get('/', async (req, res) => {
  await syncScheduledPosts();

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(24, Math.max(1, Number(req.query.limit || 9)));
  const now = new Date();
  const filters = buildQuery(req.query);
  delete filters.status;
  const query = {
    ...filters,
    ...publicVisibilityFilter(now),
  };
  const sort = req.query.sort === 'mostViewed' ? { 'analytics.views': -1 } : req.query.sort === 'oldest' ? { publishAt: 1 } : { isPinned: -1, isFeatured: -1, publishAt: -1 };

  const [blogs, total] = await Promise.all([
    Blog.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit),
    Blog.countDocuments(query),
  ]);

  res.json({
    blogs: blogs.map((blog) => ({
      ...mapBlogSummary(blog),
      seo: blog.seo,
      contentPreview: blog.contentText?.slice(0, 260) || '',
    })),
    total,
    page,
    limit,
  });
});

router.get('/slug/:slug', async (req, res) => {
  await syncScheduledPosts();

  const now = new Date();
  const blog = await Blog.findOne({ slug: req.params.slug, ...publicVisibilityFilter(now) });
  if (!blog || !isPubliclyVisible(blog, now)) return res.status(404).json({ msg: 'Blog not found' });

  const related = await Blog.find({
    _id: { $ne: blog._id },
    ...publicVisibilityFilter(now),
    $or: [{ 'category.slug': blog.category.slug }, { 'tags.slug': { $in: (blog.tags || []).map((tag) => tag.slug) } }],
  })
    .sort({ isFeatured: -1, publishAt: -1 })
    .limit(3);

  res.json({
    blog,
    related: related.map(mapBlogSummary),
    recommended: related.map(mapBlogSummary),
    breadcrumbs: [
      { label: 'Blogs', href: '/blogs' },
      ...(blog.category?.slug ? [{ label: blog.category.name, href: `/blogs?category=${blog.category.slug}` }] : []),
      { label: blog.title, href: `/blog/${blog.slug}` },
    ],
  });
});

router.post('/slug/:slug/comments', async (req, res) => {
  const now = new Date();
  const blog = await Blog.findOne({ slug: req.params.slug, allowComments: true, ...publicVisibilityFilter(now) });
  if (!blog) return res.status(404).json({ msg: 'Blog not found or comments disabled' });

  const authorName = (req.body.authorName || '').trim();
  const authorEmail = (req.body.authorEmail || '').trim();
  const content = `${req.body.content || ''}`.trim();

  if (!authorName || !authorEmail || !content) {
    return res.status(400).json({ msg: 'Name, email, and comment are required' });
  }

  const suspicious = /(casino|loan|crypto doubling|free money)/i.test(content);
  const comment = {
    authorName,
    authorEmail,
    content,
    status: suspicious ? 'spam' : 'pending',
  };

  blog.comments.push(comment);
  blog.auditLog.push({ action: 'comment-submitted', actor: authorEmail, details: 'Comment submitted', at: new Date() });
  await blog.save();

  res.status(201).json({ msg: suspicious ? 'Comment flagged for review' : 'Comment submitted for moderation' });
});

router.post('/slug/:slug/analytics', async (req, res) => {
  const blog = await Blog.findOne({ slug: req.params.slug });
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  const source = (req.body.source || 'direct').trim();
  const readTimeSeconds = Math.max(0, Number(req.body.readTimeSeconds || 0));
  const unique = Boolean(req.body.unique);
  const dateKey = new Date().toISOString().slice(0, 10);

  blog.analytics.views = (blog.analytics.views || 0) + 1;
  if (unique) blog.analytics.uniqueVisitors = (blog.analytics.uniqueVisitors || 0) + 1;
  blog.analytics.averageReadTimeSeconds = blog.analytics.averageReadTimeSeconds
    ? Math.round((blog.analytics.averageReadTimeSeconds + readTimeSeconds) / 2)
    : readTimeSeconds;
  blog.analytics.bounceRate = readTimeSeconds < 30 ? Math.min(100, (blog.analytics.bounceRate || 0) + 5) : Math.max(0, (blog.analytics.bounceRate || 0) - 2);
  blog.analytics.engagementRate = Math.max(0, Math.min(100, Math.round(((blog.analytics.averageReadTimeSeconds || 0) / Math.max(60, blog.readingTimeMinutes * 60)) * 100)));
  blog.analytics.lastViewedAt = new Date();

  const existingSource = blog.analytics.topTrafficSources.find((item) => item.source === source);
  if (existingSource) {
    existingSource.visits += 1;
  } else {
    blog.analytics.topTrafficSources.push({ source, visits: 1 });
  }

  const existingDay = blog.analytics.dailyViews.find((item) => item.date === dateKey);
  if (existingDay) {
    existingDay.views += 1;
  } else {
    blog.analytics.dailyViews.push({ date: dateKey, views: 1 });
  }

  await blog.save();
  res.json({ ok: true });
});

module.exports = router;