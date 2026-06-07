import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import BlogArticleContent from '../components/blog/BlogArticleContent';
import { API_BASE_URL } from '../config/api';
import type { BlogComment, BlogDocument, BlogSummary } from '../types/blog';

interface BlogResponse {
  blog: BlogDocument;
  related: BlogSummary[];
  recommended: BlogSummary[];
  breadcrumbs: Array<{ label: string; href: string }>;
}

const BlogPost: React.FC = () => {
  const { slug = '' } = useParams();
  const [payload, setPayload] = useState<BlogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [comment, setComment] = useState({ authorName: '', authorEmail: '', content: '' });
  const [commentState, setCommentState] = useState('');

  useEffect(() => {
    const fetchBlog = async () => {
      setLoading(true);
      try {
        const response = await axios.get<BlogResponse>(`${API_BASE_URL}/blogs/slug/${slug}`);
        setPayload(response.data);
      } finally {
        setLoading(false);
      }
    };

    fetchBlog();
  }, [slug]);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? Math.min(100, (scrollTop / height) * 100) : 0);
    };

    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!slug) return;

    const startedAt = Date.now();
    const viewedKey = `blog-viewed-${slug}`;
    const unique = !window.sessionStorage.getItem(viewedKey);
    if (unique) window.sessionStorage.setItem(viewedKey, '1');

    return () => {
      void axios.post(`${API_BASE_URL}/blogs/slug/${slug}/analytics`, {
        readTimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        source: document.referrer ? 'referral' : 'direct',
        unique,
      });
    };
  }, [slug]);

  const approvedComments = useMemo(
    () => (payload?.blog.comments || []).filter((item: BlogComment) => item.status === 'approved'),
    [payload]
  );

  const handleCommentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!slug) return;

    try {
      const response = await axios.post<{ msg: string }>(`${API_BASE_URL}/blogs/slug/${slug}/comments`, comment);
      setCommentState(response.data.msg);
      setComment({ authorName: '', authorEmail: '', content: '' });
    } catch (_error) {
      setCommentState('Failed to submit comment');
    }
  };

  if (loading || !payload) {
    return <section className="px-4 py-40 text-center text-[#94A3B8] bg-[#0A0F14] min-h-screen flex items-center justify-center">Loading article...</section>;
  }

  return (
    <section className="bg-[radial-gradient(circle_at_top,_rgba(24,182,164,0.08),transparent_45%),linear-gradient(180deg,#0A0F14_0%,#101720_35%)] pb-20 pt-24">
      <div className="fixed left-0 top-0 z-[55] h-1 bg-teal-500" style={{ width: `${progress}%` }} />
      <div className="container mx-auto grid gap-10 xl:grid-cols-[1fr_0.28fr]">
        <div className="space-y-10">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-[#94A3B8]">
            {payload.breadcrumbs.map((crumb) => (
              <React.Fragment key={crumb.href}>
                <Link to={crumb.href} className="transition hover:text-[#18B6A4]">{crumb.label}</Link>
                <span>/</span>
              </React.Fragment>
            ))}
          </nav>

          <div className="rounded-[2.5rem] border border-white/[0.06] bg-[#18222E]/80 p-8 shadow-[0_40px_90px_-45px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="mb-8 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#94A3B8]">
              <span>{payload.blog.category?.name || 'General'}</span>
              <span>{payload.blog.readingTimeMinutes} min read</span>
              <span>{payload.blog.views} views</span>
              <span>SEO {payload.blog.seo.score || payload.blog.seoScore}</span>
            </div>
            <BlogArticleContent
              title={payload.blog.title}
              subtitle={payload.blog.subtitle}
              contentHtml={payload.blog.contentHtml}
              featuredImage={payload.blog.featuredImage}
              outline={payload.blog.outline}
            />
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.blog.title)}&url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noreferrer" className="rounded-[1.75rem] border border-white/[0.06] bg-[#18222E] px-5 py-4 text-center text-sm font-semibold text-[#CBD5E1] transition hover:border-[#18B6A4]/40 hover:text-[#18B6A4] hover:bg-[#1E2A38]">Share on X</a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noreferrer" className="rounded-[1.75rem] border border-white/[0.06] bg-[#18222E] px-5 py-4 text-center text-sm font-semibold text-[#CBD5E1] transition hover:border-[#18B6A4]/40 hover:text-[#18B6A4] hover:bg-[#1E2A38]">Share on LinkedIn</a>
            <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="rounded-[1.75rem] border border-white/[0.06] bg-[#18222E] px-5 py-4 text-center text-sm font-semibold text-[#CBD5E1] transition hover:border-[#18B6A4]/40 hover:text-[#18B6A4] hover:bg-[#1E2A38]">Copy link</button>
          </div>

          <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-6 shadow-card-dark">
            <h3 className="text-2xl font-bold text-slate-900 text-white">Comments</h3>
            <p className="mt-2 text-sm text-[#94A3B8]">Join the discussion. Every comment enters moderation before it goes live.</p>

            <form onSubmit={handleCommentSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <input value={comment.authorName} onChange={(event) => setComment((current) => ({ ...current, authorName: event.target.value }))} placeholder="Your name" className="rounded-2xl border border-[#263445] bg-[#151E29] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" required />
                <input type="email" value={comment.authorEmail} onChange={(event) => setComment((current) => ({ ...current, authorEmail: event.target.value }))} placeholder="Your email" className="rounded-2xl border border-[#263445] bg-[#151E29] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" required />
              </div>
              <textarea value={comment.content} onChange={(event) => setComment((current) => ({ ...current, content: event.target.value }))} placeholder="Add your comment" className="min-h-32 w-full rounded-[1.5rem] border border-[#263445] bg-[#151E29] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]" required />
              <button type="submit" className="rounded-2xl bg-gradient-to-r from-[#18B6A4] to-[#1CC8B5] px-5 py-3 text-sm font-semibold text-[#0A0F14] hover:shadow-[0_0_15px_rgba(24,182,164,0.3)] transition duration-200">Submit for moderation</button>
              {commentState ? <p className="text-sm text-[#94A3B8]">{commentState}</p> : null}
            </form>

            <div className="mt-8 space-y-4">
              {approvedComments.length === 0 ? <p className="text-sm text-[#94A3B8]">No approved comments yet.</p> : approvedComments.map((item) => (
                <div key={item._id} className="rounded-[1.5rem] border border-white/[0.06] bg-[#101720] p-4">
                  <p className="font-semibold text-[#F8FAFC]">{item.authorName}</p>
                  <p className="mt-1 text-xs text-[#94A3B8]">{new Date(item.createdAt).toLocaleString()}</p>
                  <p className="mt-3 text-sm leading-7 text-[#CBD5E1]">{item.content}</p>
                  {(item.replies || []).map((reply) => (
                    <div key={reply._id || reply.createdAt} className="mt-3 rounded-xl bg-[#151E29] border border-white/[0.04] px-4 py-3 text-sm text-[#CBD5E1]">
                      <strong>{reply.authorName}:</strong> {reply.content}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-6 shadow-card-dark">
            <h3 className="text-2xl font-bold text-[#F8FAFC]">Related articles</h3>
            <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {payload.related.map((blog) => (
                <Link key={blog._id} to={`/blog/${blog.slug}`} className="overflow-hidden rounded-[1.75rem] border border-white/[0.06] bg-[#101720] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.35)] hover:border-[rgba(24,182,164,0.2)]">
                  <div className="aspect-[16/9] bg-[#0A0F14]">{blog.featuredImage?.url ? <img src={blog.featuredImage.url} alt={blog.featuredImage.altText || blog.title} className="h-full w-full object-cover" /> : null}</div>
                  <div className="space-y-3 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#94A3B8]">{blog.category?.name || 'General'}</p>
                    <h4 className="text-lg font-bold text-[#F8FAFC]">{blog.title}</h4>
                    <p className="text-sm leading-6 text-[#CBD5E1]">{blog.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-card-dark">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">On this page</p>
            <div className="space-y-2">
              {payload.blog.outline.map((item) => (
                <a key={item.id} href={`#${item.id}`} className="block rounded-xl px-3 py-2 text-sm text-[#CBD5E1] transition hover:bg-white/[0.04] hover:text-[#18B6A4]" style={{ paddingLeft: `${item.level * 8}px` }}>
                  {item.text}
                </a>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-card-dark">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Recommended</p>
            <div className="mt-4 space-y-4">
              {payload.recommended.map((blog) => (
                <Link key={blog._id} to={`/blog/${blog.slug}`} className="block rounded-xl bg-[#101720] border border-white/[0.04] px-4 py-3 text-sm text-[#CBD5E1] transition hover:bg-teal-950/60 hover:text-[#4DD7C8] hover:border-[#18B6A4]/30">
                  <strong>{blog.title}</strong>
                  <div className="mt-1 text-xs text-[#94A3B8]">{blog.readingTimeMinutes} min read</div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default BlogPost;