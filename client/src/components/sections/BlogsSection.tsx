import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../config/api';

interface Blog {
  _id: string;
  title: string;
  excerpt: string;
  slug: string;
  readingTimeMinutes: number;
  author: {
    name: string;
  };
  category: {
    name: string;
  };
  featuredImage?: {
    url?: string;
    altText?: string;
  };
  publishAt?: string;
  createdAt: string;
}

const BlogsSection: React.FC = () => {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/blogs`, { params: { limit: 3 } });
        setBlogs(res.data.blogs || []);
      } catch (_error) {
        setBlogs([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBlogs();
  }, []);

  return (
    <section id="blogs" className="bg-[#0A0F14] py-16 md:py-24">
      <div className="container mx-auto">
        <div className="section-title">
          <h2 className="text-white">Latest Blogs</h2>
          <p className="text-[#94A3B8]">Insights, strategy and exam guidance from Eyeconic mentors.</p>
        </div>

        {loading ? (
          <div className="text-center text-[#94A3B8]">Loading blogs...</div>
        ) : blogs.length === 0 ? (
          <div className="mx-auto max-w-3xl rounded-xl border border-white/[0.06] bg-[#18222E] px-6 py-8 text-center text-[#94A3B8]">
            Blogs are coming soon.
          </div>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {blogs.map((blog) => {
                const hasThumbnail = Boolean(blog.featuredImage?.url);
                return (
                  <article
                    key={blog._id}
                    className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#18222E] shadow-card-dark transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.12] hover:shadow-large-dark"
                  >
                    <div className="aspect-video w-full bg-[#0F172A]">
                      {hasThumbnail ? (
                        <img
                          src={blog.featuredImage?.url}
                          alt={blog.featuredImage?.altText || blog.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-950/40 to-cyan-950/40 px-6 text-center text-lg font-bold text-[#4DD7C8] border-b border-white/[0.04]">
                          {blog.title}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#4DD7C8]">
                        {blog.category?.name || 'General'} • {blog.readingTimeMinutes} min read • {new Date(blog.publishAt || blog.createdAt).toLocaleDateString()}
                      </p>
                      <h3 className="text-xl font-bold leading-snug text-white">{blog.title}</h3>
                      <p className="line-clamp-4 text-sm leading-6 text-[#94A3B8]">{blog.excerpt}</p>
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <div>
                          <p className="text-sm font-semibold text-[#CBD5E1]">{blog.author?.name || 'Eyeconic Team'}</p>
                          <p className="text-xs text-[#64748B]">Fresh editorial insights</p>
                        </div>
                        <Link to={`/blog/${blog.slug}`} className="btn btn-primary text-sm px-4 py-2">
                          Read blog
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="pt-8 text-center">
              <Link to="/blogs" className="inline-flex items-center rounded-xl border border-white/[0.08] bg-[#18222E] text-[#CBD5E1] px-6 py-3 text-sm font-semibold hover:bg-[#1E2A38] hover:text-[#18B6A4] hover:border-[rgba(24,182,164,0.35)] transition-all duration-200">
                Explore all blogs
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default BlogsSection;
