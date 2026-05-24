const express = require('express');
const sanitizeHtml = require('sanitize-html');
const Blog = require('../models/Blog');
const Category = require('../models/Category');
const Tag = require('../models/Tag');
const MediaAsset = require('../models/MediaAsset');

const router = express.Router();

const ADMIN_EMAIL = 'admin@eyeconic1.com';
const ADMIN_PASSWORD = 'admin@eyeconic$';
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
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

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
      'p',
      'div',
      'span',
      'strong',
      'em',
      'u',
      's',
      'blockquote',
      'code',
      'pre',
      'hr',
      'br',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'a',
      'img',
      'figure',
      'figcaption',
      'iframe',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'button',
      'section',
      'article',
      'aside',
      'details',
      'summary',
      'mark',
      'sup',
      'sub',
    ],
    allowedAttributes: {
      '*': ['class', 'style', 'id', 'data-type', 'data-variant'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      iframe: ['src', 'allow', 'allowfullscreen', 'frameborder', 'title'],
      button: ['type'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'data', 'mailto'],
    transformTags: {
      iframe: (tagName, attribs) => {
        const src = attribs.src || '';
        if (!src.includes('youtube.com') && !src.includes('youtu.be')) {
          return { tagName: 'div', text: 'Unsupported embed removed' };
        }

        return { tagName, attribs };
      },
    },
  });

const getWordCount = (value = '') => {
  const text = stripHtml(value);
  return text ? text.split(/\s+/).length : 0;
};

const estimateReadingTimeMinutes = (wordCount) => Math.max(1, Math.ceil(wordCount / 220));

const buildOutline = (html = '') => {
  const matches = [...html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi)];
  return matches.map((match, index) => ({
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
  const subtitle = (payload.subtitle || '').trim();
  const cleanedContentHtml = sanitizeEditorHtml(payload.contentHtml || payload.description || '');
  const contentText = stripHtml(cleanedContentHtml);
  const wordCount = getWordCount(cleanedContentHtml);
  const excerpt = (payload.excerpt || contentText.slice(0, 220)).trim();
  const slugBase = payload.seo?.customSlug || payload.slug || title;
  let slug = slugify(slugBase || existingBlog?.slug || 'post');
  if (!slug) slug = `post-${Date.now()}`;

  const category = normalizeTaxonomy(payload.category || {}, payload.category?.name || 'General');
  const tags = (Array.isArray(payload.tags) ? payload.tags : [])
    .map((tag) => normalizeTaxonomy(typeof tag === 'string' ? { name: tag } : tag))
    .filter((tag) => tag.name);

  const outline = buildOutline(cleanedContentHtml);
  const author = payload.author?.name ? { ...DEFAULT_AUTHOR, ...payload.author } : existingBlog?.author || DEFAULT_AUTHOR;
  const seo = {
    seoTitle: (payload.seo?.seoTitle || title).trim(),
    metaTitle: (payload.seo?.metaTitle || title).trim(),
    metaDescription: (payload.seo?.metaDescription || excerpt).trim(),
    focusKeyword: (payload.seo?.focusKeyword || '').trim(),
    keywords: Array.isArray(payload.seo?.keywords)
      ? payload.seo.keywords.map((item) => `${item}`.trim()).filter(Boolean)
      : [],
    canonicalUrl: (payload.seo?.canonicalUrl || '').trim(),
    customSlug: slug,
    robotsIndex: payload.seo?.robotsIndex !== false,
    robotsFollow: payload.seo?.robotsFollow !== false,
    openGraph: {
      title: (payload.seo?.openGraph?.title || title).trim(),
      description: (payload.seo?.openGraph?.description || excerpt).trim(),
      image: payload.seo?.openGraph?.image || payload.featuredImage?.url || '',
      type: payload.seo?.openGraph?.type || 'article',
    },
    twitterCard: {
      title: (payload.seo?.twitterCard?.title || title).trim(),
      description: (payload.seo?.twitterCard?.description || excerpt).trim(),
      image: payload.seo?.twitterCard?.image || payload.featuredImage?.url || '',
      cardType: payload.seo?.twitterCard?.cardType || 'summary_large_image',
    },
    schemaTypes: (Array.isArray(payload.seo?.schemaTypes) ? payload.seo.schemaTypes : ['Article']).filter((item) => allowedSchemaTypes.includes(item)),
  };

  return {
    title,
    subtitle,
    excerpt,
    slug,
    contentHtml: cleanedContentHtml,
    contentText,
    contentBlocks: Array.isArray(payload.contentBlocks) ? payload.contentBlocks : existingBlog?.contentBlocks || [],
    customHtmlBlocks: Array.isArray(payload.customHtmlBlocks) ? payload.customHtmlBlocks.filter(Boolean) : existingBlog?.customHtmlBlocks || [],
    outline,
    author,
    coAuthors: Array.isArray(payload.coAuthors) ? payload.coAuthors.map((item) => `${item}`.trim()).filter(Boolean) : existingBlog?.coAuthors || [],
    category,
    tags,
    featuredImage: getFeaturedImage(payload),
    gallery: Array.isArray(payload.gallery) ? payload.gallery : existingBlog?.gallery || [],
    embeds: Array.isArray(payload.embeds) ? payload.embeds : existingBlog?.embeds || [],
    status: payload.status || existingBlog?.status || 'draft',
    visibility: payload.visibility || existingBlog?.visibility || 'public',
    isFeatured: Boolean(payload.isFeatured),
    isPinned: Boolean(payload.isPinned),
    allowComments: payload.allowComments !== false,
    publishAt: payload.status === 'published' ? new Date(payload.publishAt || Date.now()) : existingBlog?.publishAt || null,
    scheduledFor: payload.status === 'scheduled' && payload.scheduledFor ? new Date(payload.scheduledFor) : null,
    archivedAt: payload.status === 'archived' ? new Date() : null,
    readingTimeMinutes: estimateReadingTimeMinutes(wordCount),
    wordCount,
    seo,
    analytics: existingBlog?.analytics || undefined,
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
    ];
  }

  if (status) query.status = status;
  if (category) query['category.slug'] = category;
  if (tag) query['tags.slug'] = tag;
  if (author) query['author.email'] = author;
  if (featured === 'true') query.isFeatured = true;
  if (featured === 'false') query.isFeatured = false;

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
  publishAt: blog.publishAt,
  scheduledFor: blog.scheduledFor,
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

  const media = await MediaAsset.find({}).sort({ createdAt: -1 });
  res.json({ media });
});

router.post('/admin/media', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const url = (req.body.url || req.body.dataUrl || '').trim();
  if (!url) return res.status(400).json({ msg: 'Media url or upload payload is required' });

  const media = await MediaAsset.create({
    title: (req.body.title || req.body.fileName || 'Media asset').trim(),
    url,
    altText: (req.body.altText || '').trim(),
    caption: (req.body.caption || '').trim(),
    fileName: (req.body.fileName || '').trim(),
    type: (req.body.type || 'image').trim(),
    width: Number(req.body.width || 0),
    height: Number(req.body.height || 0),
    sizeKb: Number(req.body.sizeKb || 0),
    isOptimized: Boolean(req.body.isOptimized),
  });

  res.status(201).json({ media });
});

router.put('/admin/media/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const media = await MediaAsset.findById(req.params.id);
  if (!media) return res.status(404).json({ msg: 'Media asset not found' });

  media.title = (req.body.title || media.title || '').trim();
  media.url = (req.body.url || media.url || '').trim();
  media.altText = (req.body.altText || media.altText || '').trim();
  media.caption = (req.body.caption || media.caption || '').trim();
  media.fileName = (req.body.fileName || media.fileName || '').trim();
  media.type = (req.body.type || media.type || 'image').trim();
  media.width = Number(req.body.width || media.width || 0);
  media.height = Number(req.body.height || media.height || 0);
  media.sizeKb = Number(req.body.sizeKb || media.sizeKb || 0);
  media.isOptimized = req.body.isOptimized === undefined ? media.isOptimized : Boolean(req.body.isOptimized);
  await media.save();

  res.json({ media });
});

router.delete('/admin/media/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const media = await MediaAsset.findByIdAndDelete(req.params.id);
  if (!media) return res.status(404).json({ msg: 'Media asset not found' });
  res.json({ msg: 'Media asset deleted' });
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

  const payload = await normalizeBlogPayload(req.body);
  if (!payload.title) return res.status(400).json({ msg: 'Blog title is required' });

  const existingBlogs = await Blog.find({}).select('title seo.metaDescription');
  payload.seo = { ...payload.seo, ...analyzeSeo(payload, existingBlogs) };
  payload.analytics = { seoPerformance: payload.seo.score };
  payload.versions = [
    {
      title: payload.title,
      excerpt: payload.excerpt,
      contentHtml: payload.contentHtml,
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
});

router.put('/admin/:id', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  const payload = await normalizeBlogPayload(req.body, blog);
  const existingBlogs = await Blog.find({}).select('title seo.metaDescription');
  const seo = analyzeSeo({ ...payload, _id: blog._id }, existingBlogs);

  blog.versions.unshift({
    title: blog.title,
    excerpt: blog.excerpt,
    contentHtml: blog.contentHtml,
    status: blog.status,
    savedBy: ADMIN_EMAIL,
    summary: 'Pre-update snapshot',
  });

  Object.assign(blog, payload, {
    seo: { ...payload.seo, ...seo },
    analytics: {
      ...(blog.analytics?.toObject ? blog.analytics.toObject() : blog.analytics),
      seoPerformance: seo.score,
    },
  });

  blog.auditLog.push({ action: 'updated', actor: ADMIN_EMAIL, details: `Updated ${blog.status} post`, at: new Date() });
  await blog.save();
  await refreshTaxonomyCounts();
  res.json({ blog });
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
  duplicate.slug = slugify(`${original.slug}-copy-${Date.now()}`);
  duplicate.status = 'draft';
  duplicate.publishAt = null;
  duplicate.scheduledFor = null;
  duplicate.auditLog = [{ action: 'duplicated', actor: ADMIN_EMAIL, details: `Duplicated from ${original._id}`, at: new Date() }];
  duplicate.versions = [
    {
      title: duplicate.title,
      excerpt: duplicate.excerpt,
      contentHtml: duplicate.contentHtml,
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

  const nextStatus = req.body.status;
  if (!['draft', 'review', 'published', 'scheduled', 'archived'].includes(nextStatus)) {
    return res.status(400).json({ msg: 'Invalid status' });
  }

  blog.status = nextStatus;
  blog.publishAt = nextStatus === 'published' ? new Date(req.body.publishAt || Date.now()) : blog.publishAt;
  blog.scheduledFor = nextStatus === 'scheduled' ? new Date(req.body.scheduledFor) : null;
  blog.archivedAt = nextStatus === 'archived' ? new Date() : null;
  blog.auditLog.push({ action: 'status-changed', actor: ADMIN_EMAIL, details: `Changed status to ${nextStatus}`, at: new Date() });
  await blog.save();

  res.json({ blog });
});

router.patch('/admin/:id/feature', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  if (req.body.isFeatured !== undefined) blog.isFeatured = Boolean(req.body.isFeatured);
  if (req.body.isPinned !== undefined) blog.isPinned = Boolean(req.body.isPinned);
  blog.auditLog.push({ action: 'featured-updated', actor: ADMIN_EMAIL, details: 'Updated feature flags', at: new Date() });
  await blog.save();

  res.json({ blog });
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
  const blogs = await Blog.find({ status: 'published', visibility: 'public' }).sort({ updatedAt: -1 });
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
  const query = {
    ...buildQuery(req.query),
    status: 'published',
    visibility: 'public',
  };
  const sort = req.query.sort === 'mostViewed' ? { 'analytics.views': -1 } : req.query.sort === 'oldest' ? { publishAt: 1 } : { isPinned: -1, publishAt: -1 };

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

  const blog = await Blog.findOne({ slug: req.params.slug, status: 'published', visibility: 'public' });
  if (!blog) return res.status(404).json({ msg: 'Blog not found' });

  const related = await Blog.find({
    _id: { $ne: blog._id },
    status: 'published',
    visibility: 'public',
    $or: [{ 'category.slug': blog.category.slug }, { 'tags.slug': { $in: blog.tags.map((tag) => tag.slug) } }],
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
  const blog = await Blog.findOne({ slug: req.params.slug, status: 'published', allowComments: true });
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