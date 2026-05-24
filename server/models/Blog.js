const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema(
  {
    url: { type: String, default: '', trim: true },
    title: { type: String, default: '', trim: true },
    altText: { type: String, default: '', trim: true },
    caption: { type: String, default: '', trim: true },
    type: { type: String, default: 'image', trim: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { _id: false }
);

const TaxonomySchema = new mongoose.Schema(
  {
    id: { type: String, default: '' },
    name: { type: String, default: '', trim: true },
    slug: { type: String, default: '', trim: true },
    seoTitle: { type: String, default: '', trim: true },
    metaDescription: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const AuthorSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Eyeconic Editorial Team', trim: true },
    email: { type: String, default: 'admin@eyeconic1.com', trim: true },
    avatar: { type: String, default: '', trim: true },
    role: { type: String, default: 'Admin', trim: true },
  },
  { _id: false }
);

const SeoSchema = new mongoose.Schema(
  {
    seoTitle: { type: String, default: '', trim: true },
    metaTitle: { type: String, default: '', trim: true },
    metaDescription: { type: String, default: '', trim: true },
    focusKeyword: { type: String, default: '', trim: true },
    keywords: [{ type: String, trim: true }],
    canonicalUrl: { type: String, default: '', trim: true },
    customSlug: { type: String, default: '', trim: true },
    robotsIndex: { type: Boolean, default: true },
    robotsFollow: { type: Boolean, default: true },
    openGraph: {
      title: { type: String, default: '', trim: true },
      description: { type: String, default: '', trim: true },
      image: { type: String, default: '', trim: true },
      type: { type: String, default: 'article', trim: true },
    },
    twitterCard: {
      title: { type: String, default: '', trim: true },
      description: { type: String, default: '', trim: true },
      image: { type: String, default: '', trim: true },
      cardType: { type: String, default: 'summary_large_image', trim: true },
    },
    schemaTypes: [{ type: String, trim: true }],
    score: { type: Number, default: 0 },
    suggestions: [{ type: String, trim: true }],
    warnings: [{ type: String, trim: true }],
  },
  { _id: false }
);

const AnalyticsSchema = new mongoose.Schema(
  {
    views: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    averageReadTimeSeconds: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    seoPerformance: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
    lastViewedAt: { type: Date, default: null },
    topTrafficSources: [
      {
        source: { type: String, default: '', trim: true },
        visits: { type: Number, default: 0 },
      },
    ],
    dailyViews: [
      {
        date: { type: String, default: '' },
        views: { type: Number, default: 0 },
      },
    ],
  },
  { _id: false }
);

const CommentReplySchema = new mongoose.Schema(
  {
    authorName: { type: String, default: '', trim: true },
    content: { type: String, default: '', trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const CommentSchema = new mongoose.Schema(
  {
    authorName: { type: String, default: '', trim: true },
    authorEmail: { type: String, default: '', trim: true },
    content: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'spam', 'blocked'],
      default: 'pending',
    },
    replies: [CommentReplySchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const VersionSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    excerpt: { type: String, default: '', trim: true },
    contentHtml: { type: String, default: '' },
    status: { type: String, default: 'draft', trim: true },
    savedAt: { type: Date, default: Date.now },
    savedBy: { type: String, default: 'admin@eyeconic1.com', trim: true },
    summary: { type: String, default: '', trim: true },
  },
  { _id: true }
);

const AuditSchema = new mongoose.Schema(
  {
    action: { type: String, default: '', trim: true },
    actor: { type: String, default: 'admin@eyeconic1.com', trim: true },
    details: { type: String, default: '', trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const BlogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    subtitle: { type: String, default: '', trim: true, maxlength: 220 },
    excerpt: { type: String, default: '', trim: true, maxlength: 420 },
    slug: { type: String, required: true, trim: true, unique: true, index: true },
    contentHtml: { type: String, default: '' },
    contentText: { type: String, default: '' },
    contentBlocks: [{ type: mongoose.Schema.Types.Mixed }],
    customHtmlBlocks: [{ type: String }],
    outline: [{ type: mongoose.Schema.Types.Mixed }],
    author: { type: AuthorSchema, default: () => ({}) },
    coAuthors: [{ type: String, trim: true }],
    category: { type: TaxonomySchema, default: () => ({}) },
    tags: [TaxonomySchema],
    featuredImage: { type: MediaSchema, default: () => ({}) },
    gallery: [MediaSchema],
    embeds: [{ type: mongoose.Schema.Types.Mixed }],
    status: {
      type: String,
      enum: ['draft', 'review', 'published', 'scheduled', 'archived'],
      default: 'draft',
      index: true,
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'premium'],
      default: 'public',
    },
    isFeatured: { type: Boolean, default: false, index: true },
    isPinned: { type: Boolean, default: false, index: true },
    allowComments: { type: Boolean, default: true },
    publishAt: { type: Date, default: null },
    scheduledFor: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    readingTimeMinutes: { type: Number, default: 1 },
    wordCount: { type: Number, default: 0 },
    seo: { type: SeoSchema, default: () => ({}) },
    analytics: { type: AnalyticsSchema, default: () => ({}) },
    comments: [CommentSchema],
    versions: [VersionSchema],
    auditLog: [AuditSchema],
    createdBy: { type: String, default: 'admin@eyeconic1.com', trim: true },
    updatedBy: { type: String, default: 'admin@eyeconic1.com', trim: true },
  },
  { timestamps: true }
);

BlogSchema.index({ title: 'text', excerpt: 'text', contentText: 'text', slug: 'text' });

module.exports = mongoose.model('Blog', BlogSchema);