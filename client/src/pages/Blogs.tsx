import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import type { BlogSummary, TaxonomyItem } from '../types/blog';

interface FiltersResponse {
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
  authors: string[];
}

const Blogs: React.FC = () => {
  const { categorySlug, tagSlug, authorId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [blogs, setBlogs] = useState<BlogSummary[]>([]);
  const [filters, setFilters] = useState<FiltersResponse>({ categories: [], tags: [], authors: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(searchParams.get('q') || '');

  const search = searchParams.get('q') || '';
  const activeCategory = categorySlug || searchParams.get('category') || '';
  const activeTag = tagSlug || searchParams.get('tag') || '';
  const activeAuthor = authorId ? decodeURIComponent(authorId) : searchParams.get('author') || '';

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [blogResponse, filterResponse] = await Promise.all([
          axios.get<{ blogs: BlogSummary[] }>(`${API_BASE_URL}/blogs`, {
            params: {
              search,
              category: activeCategory,
              tag: activeTag,
              author: activeAuthor,
              sort: searchParams.get('sort') || 'latest',
            },
          }),
          axios.get<FiltersResponse>(`${API_BASE_URL}/blogs/filters`),
        ]);

        setBlogs(blogResponse.data.blogs || []);
        setFilters(filterResponse.data);
      } catch (_error) {
        setBlogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [search, activeCategory, activeTag, activeAuthor, searchParams]);

  const title = activeCategory
    ? `Category: ${filters.categories.find((item) => item.slug === activeCategory)?.name || activeCategory}`
    : activeTag
      ? `Tag: ${filters.tags.find((item) => item.slug === activeTag)?.name || activeTag}`
      : activeAuthor
        ? `Author: ${activeAuthor}`
        : search
          ? `Search: ${search}`
          : 'Eyeconic Blogs';

  return (
    <section className="bg-[radial-gradient(circle_at_top,_rgba(24,182,164,0.08),transparent_45%),linear-gradient(180deg,#0A0F14_0%,#101720_45%)] pb-20 pt-32">
      <div className="container mx-auto space-y-10">
        <div className="rounded-[2.5rem] border border-white/[0.06] bg-[#18222E]/80 p-8 shadow-[0_40px_100px_-45px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#4DD7C8]">Editorial hub</p>
              <h1 className="text-4xl font-bold tracking-tight text-[#F8FAFC] md:text-6xl">{title}</h1>
              <p className="max-w-3xl text-lg leading-8 text-[#CBD5E1]">Expert strategy, preparation insights, study systems, and high-leverage breakdowns from the Eyeconic mentoring team.</p>
            </div>
            <div className="space-y-4 rounded-[2rem] border border-white/[0.06] bg-[#101720]/80 p-5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search blogs, topics, or keywords"
                className="w-full rounded-2xl border border-[#263445] bg-[#151E29] px-4 py-3 text-sm text-white placeholder-[#94A3B8] outline-none transition focus:border-[#18B6A4] focus:ring-2 focus:ring-[rgba(24,182,164,0.15)]"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const nextParams = new URLSearchParams(searchParams);
                    if (query) {
                      nextParams.set('q', query);
                    } else {
                      nextParams.delete('q');
                    }
                    setSearchParams(nextParams);
                  }}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-[#18B6A4] to-[#1CC8B5] px-4 py-3 text-sm font-semibold text-[#0A0F14] hover:shadow-[0_0_20px_rgba(24,182,164,0.3)] transition duration-200"
                >
                  Search
                </button>
                <button
                  onClick={() => {
                    setQuery('');
                    setSearchParams(new URLSearchParams());
                  }}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-[#CBD5E1] hover:bg-white/[0.08] hover:text-white transition duration-200"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-10 xl:grid-cols-[0.28fr_1fr]">
          <aside className="space-y-6 rounded-[2rem] border border-white/[0.06] bg-[#18222E] p-5 shadow-card-dark">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Categories</p>
              <div className="space-y-2">
                {filters.categories.map((category) => (
                  <Link key={category.slug} to={`/blogs/category/${category.slug}`} className="block rounded-xl px-3 py-2 text-sm text-[#CBD5E1] transition hover:bg-white/[0.04] hover:text-[#18B6A4]">
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Tags</p>
              <div className="flex flex-wrap gap-2">
                {filters.tags.map((tag) => (
                  <Link key={tag.slug} to={`/blogs/tag/${tag.slug}`} className="rounded-full bg-[#1E2A38] px-3 py-2 text-xs font-semibold text-[#94A3B8] border border-white/[0.04] transition hover:bg-teal-950/60 hover:text-[#4DD7C8] hover:border-[#18B6A4]/30">
                    {tag.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Authors</p>
              <div className="space-y-2 text-sm text-[#CBD5E1]">
                {filters.authors.map((author) => (
                  <Link key={author} to={`/blogs/author/${encodeURIComponent(author)}`} className="block rounded-xl px-3 py-2 transition hover:bg-white/[0.04] hover:text-[#18B6A4]">
                    {author}
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            {loading ? <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] px-6 py-16 text-center text-[#94A3B8]">Loading editorial feed...</div> : null}
            {!loading && blogs.length === 0 ? <div className="rounded-[2rem] border border-white/[0.06] bg-[#18222E] px-6 py-16 text-center text-[#94A3B8]">No blogs matched the current search.</div> : null}
            <div className="grid gap-6 lg:grid-cols-2">
              {blogs.map((blog) => (
                <article key={blog._id} className="overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#18222E] shadow-card-dark transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.35)] hover:border-[rgba(24,182,164,0.2)]">
                  <div className="aspect-[16/9] bg-[#101720]">
                    {blog.featuredImage?.url ? <img src={blog.featuredImage.url} alt={blog.featuredImage.altText || blog.title} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-950 to-cyan-950 px-8 text-center text-xl font-semibold text-[#4DD7C8] border-b border-white/[0.04]">{blog.title}</div>}
                  </div>
                  <div className="space-y-4 p-6">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">
                      <span>{blog.category?.name || 'General'}</span>
                      <span>{blog.readingTimeMinutes} min read</span>
                      <span>{new Date(blog.publishAt || blog.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-[#F8FAFC]">{blog.title}</h2>
                    <p className="text-sm leading-7 text-[#CBD5E1]">{blog.excerpt}</p>
                    <div className="flex flex-wrap gap-2">
                      {blog.tags.slice(0, 4).map((tag) => <span key={tag.slug} className="rounded-full bg-[#1E2A38] px-3 py-1 text-xs font-semibold text-[#94A3B8] border border-white/[0.04]">{tag.name}</span>)}
                    </div>
                    <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
                      <div>
                        <p className="text-sm font-semibold text-[#CBD5E1]">{blog.author.name}</p>
                        <p className="text-xs text-[#94A3B8]">SEO {blog.seoScore} · {blog.views} views</p>
                      </div>
                      <Link to={`/blog/${blog.slug}`} className="rounded-full bg-gradient-to-r from-[#18B6A4] to-[#1CC8B5] px-4 py-2 text-sm font-semibold text-[#0A0F14] hover:shadow-[0_0_15px_rgba(24,182,164,0.3)] transition duration-200">Read article</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Blogs;