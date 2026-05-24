export interface TaxonomyItem {
  _id?: string;
  id?: string;
  name: string;
  slug: string;
  seoTitle?: string;
  metaDescription?: string;
  description?: string;
  parentSlug?: string;
  postCount?: number;
}

export interface BlogAuthor {
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

export interface BlogMedia {
  _id?: string;
  url: string;
  title?: string;
  altText?: string;
  caption?: string;
  type?: string;
  width?: number;
  height?: number;
  fileName?: string;
  sizeKb?: number;
  isOptimized?: boolean;
  usageCount?: number;
}

export interface BlogSeo {
  seoTitle?: string;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  keywords?: string[];
  canonicalUrl?: string;
  customSlug?: string;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    type?: string;
  };
  twitterCard?: {
    title?: string;
    description?: string;
    image?: string;
    cardType?: string;
  };
  schemaTypes?: string[];
  score?: number;
  suggestions?: string[];
  warnings?: string[];
}

export interface BlogAnalytics {
  views?: number;
  uniqueVisitors?: number;
  averageReadTimeSeconds?: number;
  bounceRate?: number;
  seoPerformance?: number;
  engagementRate?: number;
  lastViewedAt?: string;
  topTrafficSources?: Array<{ source: string; visits: number }>;
  dailyViews?: Array<{ date: string; views: number }>;
}

export interface BlogCommentReply {
  _id?: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface BlogComment {
  _id: string;
  authorName: string;
  authorEmail: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';
  replies: BlogCommentReply[];
  createdAt: string;
  updatedAt: string;
  blogId?: string;
  blogTitle?: string;
  blogSlug?: string;
}

export interface BlogVersion {
  _id?: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  status: string;
  savedAt: string;
  savedBy: string;
  summary: string;
}

export interface BlogAuditLog {
  _id?: string;
  action: string;
  actor: string;
  details: string;
  at: string;
}

export interface BlogOutlineItem {
  id: string;
  level: number;
  text: string;
}

export interface BlogSummary {
  _id: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  slug: string;
  author: BlogAuthor;
  coAuthors?: string[];
  category: TaxonomyItem;
  tags: TaxonomyItem[];
  status: 'draft' | 'review' | 'published' | 'scheduled' | 'archived';
  visibility: 'public' | 'private' | 'premium';
  isFeatured: boolean;
  isPinned: boolean;
  allowComments: boolean;
  featuredImage?: BlogMedia;
  publishAt?: string | null;
  scheduledFor?: string | null;
  archivedAt?: string | null;
  updatedAt: string;
  createdAt: string;
  readingTimeMinutes: number;
  wordCount: number;
  views: number;
  uniqueVisitors: number;
  seoScore: number;
  seoWarnings: string[];
  seoSuggestions: string[];
  commentsCount: number;
}

export interface BlogDocument extends BlogSummary {
  contentHtml: string;
  contentText?: string;
  contentBlocks?: Array<Record<string, unknown>>;
  customHtmlBlocks?: string[];
  outline: BlogOutlineItem[];
  gallery: BlogMedia[];
  embeds: Array<Record<string, unknown>>;
  seo: BlogSeo;
  analytics?: BlogAnalytics;
  comments: BlogComment[];
  versions: BlogVersion[];
  auditLog: BlogAuditLog[];
}

export interface BlogDashboardResponse {
  blogs: BlogSummary[];
  total: number;
  page: number;
  limit: number;
  search: string;
  summary: {
    totalPosts: number;
    drafts: number;
    published: number;
    scheduled: number;
    archived: number;
    featured: number;
    pinned: number;
    totalViews: number;
    totalUniqueVisitors: number;
    averageSeoScore: number;
    averageReadTime: number;
  };
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  media: BlogMedia[];
}