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
    <section id="blogs" className="bg-white py-16 md:py-24">
      <div className="container mx-auto">
        <div className="section-title">
          <h2>Latest Blogs</h2>
          <p>Insights, strategy and exam guidance from Eyeconic mentors.</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500">Loading blogs...</div>
        ) : blogs.length === 0 ? (
          <div className="mx-auto max-w-3xl rounded-xl border border-teal-100 bg-teal-50 px-6 py-8 text-center text-teal-900">
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
                    className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="aspect-video w-full bg-teal-100">
                      {hasThumbnail ? (
                        <img
                          src={blog.featuredImage?.url}
                          alt={blog.featuredImage?.altText || blog.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-200 to-cyan-100 px-6 text-center text-lg font-semibold text-teal-900">
                          {blog.title}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">
                        {blog.category?.name || 'General'} • {blog.readingTimeMinutes} min read • {new Date(blog.publishAt || blog.createdAt).toLocaleDateString()}
                      </p>
                      <h3 className="text-xl font-bold leading-snug text-gray-900">{blog.title}</h3>
                      <p className="line-clamp-4 text-sm leading-6 text-gray-600">{blog.excerpt}</p>
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{blog.author?.name || 'Eyeconic Team'}</p>
                          <p className="text-xs text-gray-500">Fresh editorial insights</p>
                        </div>
                        <Link to={`/blog/${blog.slug}`} className="inline-flex items-center rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700">
                          Read blog
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="pt-8 text-center">
              <Link to="/blogs" className="inline-flex items-center rounded-full border border-teal-200 px-6 py-3 text-sm font-semibold text-teal-700 transition hover:bg-teal-50">
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
