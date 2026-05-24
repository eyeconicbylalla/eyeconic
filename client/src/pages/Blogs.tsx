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
    <section className="bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.16),transparent_45%),linear-gradient(180deg,#f8fafc_0%,#ffffff_45%)] pb-20 pt-32">
      <div className="container mx-auto space-y-10">
        <div className="rounded-[2.5rem] border border-white/60 bg-white/90 p-8 shadow-[0_40px_100px_-45px_rgba(15,118,110,0.5)] backdrop-blur">
          <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-teal-700">Editorial hub</p>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-6xl">{title}</h1>
              <p className="max-w-3xl text-lg leading-8 text-slate-600">Expert strategy, preparation insights, study systems, and high-leverage breakdowns from the Eyeconic mentoring team.</p>
            </div>
            <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search blogs, topics, or keywords"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
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
                  className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
                >
                  Search
                </button>
                <button
                  onClick={() => {
                    setQuery('');
                    setSearchParams(new URLSearchParams());
                  }}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-10 xl:grid-cols-[0.28fr_1fr]">
          <aside className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Categories</p>
              <div className="space-y-2">
                {filters.categories.map((category) => (
                  <Link key={category.slug} to={`/blogs/category/${category.slug}`} className="block rounded-xl px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Tags</p>
              <div className="flex flex-wrap gap-2">
                {filters.tags.map((tag) => (
                  <Link key={tag.slug} to={`/blogs/tag/${tag.slug}`} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-teal-100 hover:text-teal-800">
                    {tag.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Authors</p>
              <div className="space-y-2 text-sm text-slate-700">
                {filters.authors.map((author) => (
                  <Link key={author} to={`/blogs/author/${encodeURIComponent(author)}`} className="block rounded-xl px-3 py-2 transition hover:bg-slate-50">
                    {author}
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            {loading ? <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">Loading editorial feed...</div> : null}
            {!loading && blogs.length === 0 ? <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center text-slate-500">No blogs matched the current search.</div> : null}
            <div className="grid gap-6 lg:grid-cols-2">
              {blogs.map((blog) => (
                <article key={blog._id} className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="aspect-[16/9] bg-slate-100">
                    {blog.featuredImage?.url ? <img src={blog.featuredImage.url} alt={blog.featuredImage.altText || blog.title} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-100 to-cyan-50 px-8 text-center text-xl font-semibold text-teal-900">{blog.title}</div>}
                  </div>
                  <div className="space-y-4 p-6">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <span>{blog.category?.name || 'General'}</span>
                      <span>{blog.readingTimeMinutes} min read</span>
                      <span>{new Date(blog.publishAt || blog.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">{blog.title}</h2>
                    <p className="text-sm leading-7 text-slate-600">{blog.excerpt}</p>
                    <div className="flex flex-wrap gap-2">
                      {blog.tags.slice(0, 4).map((tag) => <span key={tag.slug} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{tag.name}</span>)}
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{blog.author.name}</p>
                        <p className="text-xs text-slate-500">SEO {blog.seoScore} · {blog.views} views</p>
                      </div>
                      <Link to={`/blog/${blog.slug}`} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Read article</Link>
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